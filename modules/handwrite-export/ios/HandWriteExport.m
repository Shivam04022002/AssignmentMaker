// HandWrite native exporter (iOS). Mirrors the Android module:
// draws rendered page views into a PDF context (vector) or an image, one
// page at a time, and shares the files. Not compiled in the Windows build
// environment this project was developed in — verify on macOS.

#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>

#if __has_include(<React/RCTViewRegistry.h>)
#import <React/RCTViewRegistry.h>
#endif

@interface HandWriteExportPdfJob : NSObject
@property (nonatomic, assign) CGContextRef context;
@property (nonatomic, assign) CGRect box;
@property (nonatomic, copy) NSString *path;
@property (nonatomic, assign) NSInteger pages;
@end

@implementation HandWriteExportPdfJob
@end

@interface HandWriteExport : NSObject <RCTBridgeModule>
@end

@implementation HandWriteExport {
  NSMutableDictionary<NSString *, HandWriteExportPdfJob *> *_pdfs;
}

@synthesize viewRegistry_DEPRECATED = _viewRegistry_DEPRECATED;

RCT_EXPORT_MODULE(HandWriteExport)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

// Views are only touched on the main thread.
- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

- (instancetype)init
{
  if ((self = [super init])) {
    _pdfs = [NSMutableDictionary new];
  }
  return self;
}

- (UIView *)viewForTag:(NSNumber *)tag
{
  return [self.viewRegistry_DEPRECATED viewForReactTag:tag];
}

- (void)prepareFile:(NSString *)path
{
  [[NSFileManager defaultManager] createDirectoryAtPath:[path stringByDeletingLastPathComponent]
                            withIntermediateDirectories:YES
                                             attributes:nil
                                                  error:nil];
}

RCT_EXPORT_METHOD(getExportDirectory:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  NSString *dir = [NSTemporaryDirectory() stringByAppendingPathComponent:@"exports"];
  [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
  resolve(dir);
}

RCT_EXPORT_METHOD(beginPdf:(NSString *)path
                  width:(double)width
                  height:(double)height
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [self prepareFile:path];
  CGRect box = CGRectMake(0, 0, width, height);
  CGContextRef context = CGPDFContextCreateWithURL((__bridge CFURLRef)[NSURL fileURLWithPath:path], &box, NULL);
  if (!context) {
    reject(@"E_PDF", @"Could not create PDF", nil);
    return;
  }
  HandWriteExportPdfJob *job = [HandWriteExportPdfJob new];
  job.context = context;
  job.box = box;
  job.path = path;
  NSString *jobId = [[NSUUID UUID] UUIDString];
  _pdfs[jobId] = job;
  resolve(jobId);
}

RCT_EXPORT_METHOD(addPdfPage:(NSString *)jobId
                  viewTag:(nonnull NSNumber *)viewTag
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  HandWriteExportPdfJob *job = _pdfs[jobId];
  UIView *view = [self viewForTag:viewTag];
  if (!job || !view || view.bounds.size.width == 0) {
    reject(@"E_PDF_PAGE", @"Page view not found", nil);
    return;
  }
  CGContextRef ctx = job.context;
  CGPDFContextBeginPage(ctx, NULL);
  CGContextSaveGState(ctx);
  // PDF space is bottom-up; UIKit layers draw top-down.
  CGContextTranslateCTM(ctx, 0, job.box.size.height);
  CGContextScaleCTM(ctx, job.box.size.width / view.bounds.size.width,
                    -job.box.size.height / view.bounds.size.height);
  [view.layer renderInContext:ctx];
  CGContextRestoreGState(ctx);
  CGPDFContextEndPage(ctx);
  job.pages += 1;
  resolve(@(job.pages));
}

RCT_EXPORT_METHOD(finishPdf:(NSString *)jobId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  HandWriteExportPdfJob *job = _pdfs[jobId];
  if (!job) {
    reject(@"E_NO_PDF", @"Unknown PDF export", nil);
    return;
  }
  [_pdfs removeObjectForKey:jobId];
  CGPDFContextClose(job.context);
  CGContextRelease(job.context);
  resolve(job.path);
}

RCT_EXPORT_METHOD(cancelPdf:(NSString *)jobId)
{
  HandWriteExportPdfJob *job = _pdfs[jobId];
  if (job) {
    [_pdfs removeObjectForKey:jobId];
    CGPDFContextClose(job.context);
    CGContextRelease(job.context);
    [[NSFileManager defaultManager] removeItemAtPath:job.path error:nil];
  }
}

RCT_EXPORT_METHOD(captureView:(nonnull NSNumber *)viewTag
                  path:(NSString *)path
                  format:(NSString *)format
                  pixelWidth:(double)pixelWidth
                  quality:(double)quality
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  UIView *view = [self viewForTag:viewTag];
  if (!view || view.bounds.size.width == 0) {
    reject(@"E_CAPTURE", @"Page view not found", nil);
    return;
  }
  CGFloat width = MIN(MAX(pixelWidth, 1), 2480);
  CGFloat height = round(width * view.bounds.size.height / view.bounds.size.width);
  UIGraphicsImageRendererFormat *rendererFormat = [UIGraphicsImageRendererFormat preferredFormat];
  rendererFormat.scale = 1;
  rendererFormat.opaque = YES;
  UIGraphicsImageRenderer *renderer =
      [[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(width, height) format:rendererFormat];
  UIImage *image = [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
    [[UIColor whiteColor] setFill];
    UIRectFill(CGRectMake(0, 0, width, height));
    CGContextScaleCTM(context.CGContext, width / view.bounds.size.width, height / view.bounds.size.height);
    [view.layer renderInContext:context.CGContext];
  }];
  BOOL jpeg = [format.lowercaseString isEqualToString:@"jpg"] || [format.lowercaseString isEqualToString:@"jpeg"];
  NSData *data = jpeg ? UIImageJPEGRepresentation(image, quality) : UIImagePNGRepresentation(image);
  [self prepareFile:path];
  if (![data writeToFile:path atomically:YES]) {
    reject(@"E_IMAGE_WRITE", @"Could not write image", nil);
    return;
  }
  resolve(path);
}

RCT_EXPORT_METHOD(share:(NSArray<NSString *> *)paths
                  mimeType:(NSString *)mimeType
                  title:(NSString *)title
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSMutableArray<NSURL *> *urls = [NSMutableArray new];
  for (NSString *path in paths) {
    [urls addObject:[NSURL fileURLWithPath:path]];
  }
  UIViewController *presenter = RCTPresentedViewController();
  if (urls.count == 0 || !presenter) {
    reject(@"E_SHARE", @"Nothing to share", nil);
    return;
  }
  UIActivityViewController *controller = [[UIActivityViewController alloc] initWithActivityItems:urls
                                                                           applicationActivities:nil];
  controller.popoverPresentationController.sourceView = presenter.view;
  controller.popoverPresentationController.sourceRect =
      CGRectMake(CGRectGetMidX(presenter.view.bounds), CGRectGetMidY(presenter.view.bounds), 0, 0);
  [presenter presentViewController:controller animated:YES completion:nil];
  resolve(@YES);
}

@end
