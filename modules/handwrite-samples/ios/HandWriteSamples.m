// HandWrite native image input for handwriting samples (iOS). Mirrors the
// Android module:
//   pickImage()                      PHPicker → private copy in tmp/handwrite-samples
//                                    → { uri, mime, width, height, bytes, orientation }
//                                    (nil when the user closes the picker)
//   decodeForAnalysis(uri, maxEdge)  ImageIO thumbnail with the EXIF transform
//                                    applied → 8-bit grayscale, base64
//   releaseImage(uri)                deletes one copy (only inside our folder)
//   clearTemporaryImages()           deletes every copy
// Everything stays on the device; nothing is logged. Not compiled in the
// Windows environment this project is developed in — verify on macOS.

#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>
#import <PhotosUI/PhotosUI.h>
#import <ImageIO/ImageIO.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static NSString *const kFolder = @"handwrite-samples";
static const NSInteger kMinEdge = 256;
static const NSInteger kMaxEdge = 4096;

@interface HandWriteSamples : NSObject <RCTBridgeModule, PHPickerViewControllerDelegate, UIAdaptivePresentationControllerDelegate>
@end

@implementation HandWriteSamples {
  RCTPromiseResolveBlock _resolve;
  RCTPromiseRejectBlock _reject;
  dispatch_queue_t _io;
}

RCT_EXPORT_MODULE(HandWriteSamples)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if ((self = [super init])) {
    _io = dispatch_queue_create("com.handwrite.samples", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (NSString *)folder
{
  NSString *dir = [NSTemporaryDirectory() stringByAppendingPathComponent:kFolder];
  [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
  return dir;
}

/** The sample copy a uri names — only files inside our own folder. */
- (NSString *)ownPath:(NSString *)uri
{
  NSURL *url = [NSURL URLWithString:uri];
  NSString *path = url.isFileURL ? url.path : nil;
  if (!path) {
    return nil;
  }
  NSString *root = [[[self folder] stringByStandardizingPath] stringByAppendingString:@"/"];
  NSString *standard = [path stringByStandardizingPath];
  return [standard hasPrefix:root] ? standard : nil;
}

- (void)finishWith:(id)result
{
  RCTPromiseResolveBlock resolve = _resolve;
  _resolve = nil;
  _reject = nil;
  if (resolve) {
    resolve(result);
  }
}

- (void)failWith:(NSString *)code message:(NSString *)message
{
  RCTPromiseRejectBlock reject = _reject;
  _resolve = nil;
  _reject = nil;
  if (reject) {
    reject(code, message, nil);
  }
}

RCT_EXPORT_METHOD(pickImage:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self->_resolve) {
      reject(@"picker-busy", @"A photo is already being chosen", nil);
      return;
    }
    UIViewController *presenter = RCTPresentedViewController();
    if (!presenter) {
      reject(@"unknown", @"The photo picker cannot be opened right now", nil);
      return;
    }
    self->_resolve = resolve;
    self->_reject = reject;
    PHPickerConfiguration *config = [[PHPickerConfiguration alloc] init];
    config.filter = [PHPickerFilter imagesFilter];
    config.selectionLimit = 1;
    PHPickerViewController *picker = [[PHPickerViewController alloc] initWithConfiguration:config];
    picker.delegate = self;
    picker.presentationController.delegate = self;
    [presenter presentViewController:picker animated:YES completion:nil];
  });
}

// Swiped down without choosing.
- (void)presentationControllerDidDismiss:(UIPresentationController *)presentationController
{
  [self finishWith:nil];
}

- (void)picker:(PHPickerViewController *)picker didFinishPicking:(NSArray<PHPickerResult *> *)results
{
  [picker dismissViewControllerAnimated:YES completion:nil];
  NSItemProvider *provider = results.firstObject.itemProvider;
  if (!provider) {
    [self finishWith:nil];
    return;
  }
  NSString *type = UTTypeImage.identifier;
  if (![provider hasItemConformingToTypeIdentifier:type]) {
    [self failWith:@"unsupported-format" message:@"That item is not an image"];
    return;
  }
  [provider loadFileRepresentationForTypeIdentifier:type
                                  completionHandler:^(NSURL *url, NSError *error) {
    // The provided file is deleted when this block returns: copy it now.
    if (!url || error) {
      [self failWith:@"unreadable" message:@"That image could not be opened"];
      return;
    }
    NSString *ext = url.pathExtension.length ? url.pathExtension.lowercaseString : @"jpg";
    NSString *dest = [[self folder] stringByAppendingPathComponent:
                      [NSString stringWithFormat:@"%@.%@", [NSUUID UUID].UUIDString, ext]];
    NSError *copyError = nil;
    if (![[NSFileManager defaultManager] copyItemAtPath:url.path toPath:dest error:&copyError]) {
      [self failWith:@"temp-file" message:@"The photo could not be copied for analysis"];
      return;
    }
    NSURL *destURL = [NSURL fileURLWithPath:dest];
    CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)destURL, NULL);
    NSDictionary *props = source ? (__bridge_transfer NSDictionary *)CGImageSourceCopyPropertiesAtIndex(source, 0, NULL) : nil;
    NSString *uti = source ? (__bridge NSString *)CGImageSourceGetType(source) : nil;
    if (source) {
      CFRelease(source);
    }
    NSInteger width = [props[(NSString *)kCGImagePropertyPixelWidth] integerValue];
    NSInteger height = [props[(NSString *)kCGImagePropertyPixelHeight] integerValue];
    if (width <= 0 || height <= 0) {
      [[NSFileManager defaultManager] removeItemAtPath:dest error:nil];
      [self failWith:@"unreadable" message:@"That image could not be opened"];
      return;
    }
    NSInteger orientation = [props[(NSString *)kCGImagePropertyOrientation] integerValue];
    UTType *utType = uti ? [UTType typeWithIdentifier:uti] : nil;
    NSString *mime = utType.preferredMIMEType ?: @"image/jpeg";
    NSDictionary *attrs = [[NSFileManager defaultManager] attributesOfItemAtPath:dest error:nil];
    [self finishWith:@{
      @"uri": destURL.absoluteString,
      @"mime": mime.lowercaseString,
      @"width": @(width),
      @"height": @(height),
      @"bytes": @([attrs fileSize]),
      @"orientation": @(orientation >= 1 && orientation <= 8 ? orientation : 1),
    }];
  }];
}

RCT_EXPORT_METHOD(decodeForAnalysis:(NSString *)uri
                  maxLongEdge:(double)maxLongEdge
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(_io, ^{
    CFAbsoluteTime started = CFAbsoluteTimeGetCurrent();
    NSString *path = [self ownPath:uri];
    if (!path || ![[NSFileManager defaultManager] fileExistsAtPath:path]) {
      reject(@"unreadable", @"The sample image is no longer available", nil);
      return;
    }
    CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)[NSURL fileURLWithPath:path], NULL);
    if (!source) {
      reject(@"unreadable", @"That image could not be opened", nil);
      return;
    }
    NSDictionary *props = (__bridge_transfer NSDictionary *)CGImageSourceCopyPropertiesAtIndex(source, 0, NULL);
    NSInteger w0 = [props[(NSString *)kCGImagePropertyPixelWidth] integerValue];
    NSInteger h0 = [props[(NSString *)kCGImagePropertyPixelHeight] integerValue];
    NSInteger orientation = [props[(NSString *)kCGImagePropertyOrientation] integerValue];
    NSInteger target = MIN(kMaxEdge, MAX(kMinEdge, (NSInteger)llround(maxLongEdge)));
    // The thumbnail API decodes at reduced size and applies the EXIF transform.
    NSDictionary *options = @{
      (NSString *)kCGImageSourceCreateThumbnailFromImageAlways: @YES,
      (NSString *)kCGImageSourceCreateThumbnailWithTransform: @YES,
      (NSString *)kCGImageSourceThumbnailMaxPixelSize: @(MIN(target, MAX(w0, h0))),
      (NSString *)kCGImageSourceShouldCacheImmediately: @YES,
    };
    CGImageRef image = CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)options);
    CFRelease(source);
    if (!image) {
      reject(@"unsupported-format", @"This image format cannot be decoded on this device", nil);
      return;
    }
    size_t width = CGImageGetWidth(image);
    size_t height = CGImageGetHeight(image);
    NSMutableData *gray = [NSMutableData dataWithLength:width * height];
    CGColorSpaceRef space = CGColorSpaceCreateDeviceGray();
    // stride = width: one byte per pixel, no padding.
    CGContextRef ctx = CGBitmapContextCreate(gray.mutableBytes, width, height, 8, width, space, kCGImageAlphaNone);
    CGColorSpaceRelease(space);
    if (!ctx) {
      CGImageRelease(image);
      reject(@"out-of-memory", @"The image is too large to analyse on this device", nil);
      return;
    }
    CGContextSetFillColorWithColor(ctx, [UIColor whiteColor].CGColor); // transparent PNGs on white paper
    CGContextFillRect(ctx, CGRectMake(0, 0, width, height));
    CGContextDrawImage(ctx, CGRectMake(0, 0, width, height), image);
    CGContextRelease(ctx);
    CGImageRelease(image);
    resolve(@{
      @"width": @(width),
      @"height": @(height),
      @"encoding": @"gray8-base64",
      @"data": [gray base64EncodedStringWithOptions:0],
      @"sourceWidth": @(w0),
      @"sourceHeight": @(h0),
      @"orientation": @(orientation >= 1 && orientation <= 8 ? orientation : 1),
      @"orientationApplied": @YES,
      @"decodeMillis": @((CFAbsoluteTimeGetCurrent() - started) * 1000.0),
    });
  });
}

RCT_EXPORT_METHOD(releaseImage:(NSString *)uri
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(_io, ^{
    NSString *path = [self ownPath:uri];
    BOOL removed = path && [[NSFileManager defaultManager] removeItemAtPath:path error:nil];
    resolve(@(removed));
  });
}

RCT_EXPORT_METHOD(clearTemporaryImages:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(_io, ^{
    NSString *dir = [self folder];
    NSInteger count = 0;
    for (NSString *name in [[NSFileManager defaultManager] contentsOfDirectoryAtPath:dir error:nil]) {
      if ([[NSFileManager defaultManager] removeItemAtPath:[dir stringByAppendingPathComponent:name] error:nil]) {
        count++;
      }
    }
    resolve(@(count));
  });
}

@end
