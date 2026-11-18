package com.handwrite.samples

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

// Autolinking looks for a ReactPackage subclass:
// class HandWriteSamplesPackage implements ReactPackage
class HandWriteSamplesPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == HandWriteSamplesModule.NAME) HandWriteSamplesModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
      HandWriteSamplesModule.NAME to ReactModuleInfo(
        HandWriteSamplesModule.NAME,
        HandWriteSamplesModule::class.java.name,
        false, // canOverrideExistingModule
        false, // needsEagerInit
        false, // isCxxModule
        false, // isTurboModule: legacy module, served by the interop layer
      ),
    )
  }
}
