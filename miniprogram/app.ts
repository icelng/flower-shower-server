// app.ts
import { Buffer } from 'buffer';

const SERVICE_UUID_CONFIG_MANAGER = "0000000C-0000-1000-8000-00805F9B34FB"
const CHAR_UUID_CONFIG_MANAGER = "00000C01-0000-1000-8000-00805F9B34FB"

const CONFIG_OP_SET: number = 0
const CONFIG_OP_GET: number = 1

App<IAppOption>({
  globalData: {
    isBLEConnected: false
  },

  charValueChangeCallbacks: undefined,

  onLaunch() {
    wx.onBLEConnectionStateChange((result: WechatMiniprogram.OnBLEConnectionStateChangeCallbackResult) => {
      console.log("BLE connection change! deviceId: ", result.deviceId)
      if (this.globalData.isBLEConnected && !result.connected) {
        this.onConnectionClose()
      } else if (!this.globalData.isBLEConnected && result.connected) {
        this.onConnectionCreated()
      }
      this.globalData.isBLEConnected = result.connected
    })
  },

  async onConnectionCreated() {
    this.charValueChangeCallbacks = new Map();
    this.charValueChangeOnceCallbacks = new Map();
    wx.onBLECharacteristicValueChange((result) => {
      var charId = result.characteristicId
      var onceCb = this.charValueChangeOnceCallbacks?.get(charId)
      var cb = this.charValueChangeCallbacks?.get(charId)
      if (onceCb !== undefined) {
        this.charValueChangeOnceCallbacks?.delete(charId)
        onceCb(result)
      } else if (cb !== undefined) {
        cb(result)
      }
    })
  },

  async onConnectionClose() {
    await wx.showModal({
      confirmText: "嗯嗯",
      title: "(ó﹏ò｡)蓝牙已断开，请重新连接!",
      showCancel: false
    })

    wx.offBLEConnectionStateChange(() => {})
    this.globalData.connectedDevice = undefined
    this.charValueChangeCallbacks = undefined
    this.charValueChangeOnceCallbacks = undefined

    var pages = getCurrentPages()
    var currentPage = pages[pages.length-1]
    var url = currentPage.route
    if (url !== "pages/index/index") {
      wx.redirectTo({url: "../index/index"})
    }
  },

  listenCharValueChange(charateristicId: string, cb: WechatMiniprogram.OnBLECharacteristicValueChangeCallback): void {
    if (this.charValueChangeCallbacks === undefined) {
      console.log("Failed to register charateristic callback!")
      return
    }
    this.charValueChangeCallbacks.set(charateristicId, cb)
  },

  async listenCharValueChangeOnce(charateristicId: string): Promise<WechatMiniprogram.OnBLECharacteristicValueChangeCallbackResult> {
    if (this.charValueChangeOnceCallbacks === undefined) {
      throw "device is not connected"
    }

    if (this.charValueChangeOnceCallbacks.has(charateristicId)) {
      throw "Too many times"
    }

    var promise = new Promise<WechatMiniprogram.OnBLECharacteristicValueChangeCallbackResult>((resolve, reject) => {
      this.charValueChangeOnceCallbacks?.set(charateristicId, (result) => {
        resolve(result)
      })
      setTimeout(() => {
        reject("Listen charateristic timeout!")
        this.charValueChangeCallbacks?.delete(charateristicId)
      }, 5000)
    })

    return promise
  },

  async getDeviceConfig(deviceId: string, configName: string): Promise<string> {
    /*|--op(1 byte)--|--config name length(2 bytes)--|--config name(name length bytes)--|*/
    var buffer = Buffer.alloc(configName.length + 3)
    buffer.writeUInt8(CONFIG_OP_GET, 0)
    buffer.writeUInt16LE(configName.length, 1)
    buffer.write(configName, 3, configName.length, "utf-8")
    await wx.writeBLECharacteristicValue({
      deviceId: deviceId,
      serviceId: SERVICE_UUID_CONFIG_MANAGER,
      characteristicId: CHAR_UUID_CONFIG_MANAGER,
      value: buffer.buffer
    })

    var promise = new Promise<string>((resolve, reject) => {
      this.listenCharValueChangeOnce(CHAR_UUID_CONFIG_MANAGER).then((res) => {
        /*|--name length(2 bytes)--|--name(length bytes)--|--value length(2 bytes)--|--value--|*/
        var buffer = Buffer.from(res.value)
        var nameLength = buffer.readUInt16LE(0)
        var valueLength = buffer.readUInt16LE(2 + nameLength)
        var name = buffer.toString("utf-8", 2, 2 + nameLength)
        var value = buffer.toString("utf-8", 4 + nameLength, 4 + nameLength + valueLength)

        if (name === "notfound") {
          reject("Failed to read config value, config name not found: " + configName)
        } else {
          resolve(value)
        }
      }).catch((e) => {
        console.log("Failed to read config value, ", e)
        reject(e)
      })
    })

    wx.readBLECharacteristicValue({
      deviceId: deviceId,
      serviceId: SERVICE_UUID_CONFIG_MANAGER,
      characteristicId: CHAR_UUID_CONFIG_MANAGER,
    })

    return promise
  },

  async setDeviceConfig(deviceId: string, configName: string, configValue: string): Promise<void> {
    /*|--op(1 byte)--|--name length(2 bytes)--|--name(name length bytes)--|--value len(2 bytes)--|--value--|*/
    var buffer = Buffer.alloc(configName.length + configValue.length + 5)
    buffer.writeUInt8(CONFIG_OP_SET, 0)
    buffer.writeUInt16LE(configName.length, 1)
    buffer.write(configName, 3, configName.length, "utf-8")
    buffer.writeUInt16LE(configValue.length, 3 + configName.length)
    buffer.write(configValue, 5 + configName.length, configValue.length, "utf-8")
    await wx.writeBLECharacteristicValue({
      deviceId: deviceId,
      serviceId: SERVICE_UUID_CONFIG_MANAGER,
      characteristicId: CHAR_UUID_CONFIG_MANAGER,
      value: buffer.buffer
    })
  },

  saveHistoryDevice(device: BLEDevice) {
    wx.setStorageSync("hd-" + device.deviceId, device)
  },
})
