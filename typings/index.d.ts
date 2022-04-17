/// <reference path="./types/index.d.ts" />

interface BLEDevice {
  name: string
  deviceId: string
}

interface IAppOption {
  globalData: {
    connectedDevice?: BLEDevice
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback,
  onConnectionClose: () => void
}
