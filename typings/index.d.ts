/// <reference path="./types/index.d.ts" />

interface BLEDevice {
  name: string
  deviceId: string
}

interface IAppOption {
  globalData: {
    isBLEConnected?: boolean,
    connectedDevice?: BLEDevice
  }
  charValueChangeCallbacks?: Map<string, WechatMiniprogram.OnBLECharacteristicValueChangeCallback>

  onConnectionClose: () => void,
  listenCharValueChange: (charateristicId: string, cb: WechatMiniprogram.OnBLECharacteristicValueChangeCallback) => void
}
