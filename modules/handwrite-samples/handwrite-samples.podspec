require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "handwrite-samples"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://example.invalid/handwrite"
  s.license      = { :type => "UNLICENSED" }
  s.authors      = "HandWrite"
  s.platforms    = { :ios => "15.1" }
  s.source       = { :path => "." }
  s.source_files = "ios/**/*.{h,m,mm}"
  s.frameworks   = "PhotosUI", "ImageIO", "UniformTypeIdentifiers"
  s.dependency "React-Core"
end
