/// <reference path="./types/index.d.ts" />
interface BLEDevice {
  name: string
  deviceId: string
  password?: string
}

interface IAppOption {
  globalData: {
    isBLEConnected?: boolean,
    connectedDevice?: BLEDevice
    configChar?: WechatMiniprogram.BLECharacteristic
  }

  charValueChangeCallbacks?: Map<string, WechatMiniprogram.OnBLECharacteristicValueChangeCallback>
  charValueChangeOnceCallbacks?: Map<string, WechatMiniprogram.OnBLECharacteristicValueChangeCallback>

  onConnectionCreated: () => Promise<void>,
  onConnectionClose: () => Promise<void>,
  listenCharValueChange: (charateristicId: string, cb: WechatMiniprogram.OnBLECharacteristicValueChangeCallback) => void
  listenCharValueChangeOnce: (charateristicId: string) => Promise<WechatMiniprogram.OnBLECharacteristicValueChangeCallbackResult>
  getDeviceConfig: (deviceId: string, configName: string) => Promise<string>
  setDeviceConfig: (deviceId: string, configName: string, configValue: string) => Promise<void>
  saveHistoryDevice: (device: BLEDevice) => void
}
