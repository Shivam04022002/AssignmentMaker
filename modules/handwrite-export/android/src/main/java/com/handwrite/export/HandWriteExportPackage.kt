package com.handwrite.export

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

// Autolinking looks for a ReactPackage subclass:
// class HandWriteExportPackage implements ReactPackage
class HandWriteExportPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == HandWriteExportModule.NAME) HandWriteExportModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
      HandWriteExportModule.NAME to ReactModuleInfo(
        HandWriteExportModule.NAME,
        HandWriteExportModule::class.java.name,
        false, // canOverrideExistingModule
        false, // needsEagerInit
        false, // isCxxModule
        false, // isTurboModule: legacy module, served by the interop layer
      ),
    )
  }
}
