// app.ts

App<IAppOption>({
  globalData: {
    isBLEConnected: false

  },

  charValueChangeCallbacks: undefined,

  onLaunch() {
    wx.onBLEConnectionStateChange((result: WechatMiniprogram.OnBLEConnectionStateChangeCallbackResult) => {
      console.log("BLE connection change! deviceId: ", result.deviceId)
      if (this.globalData.isBLEConnected && !result.connected) {
        this.charValueChangeCallbacks = undefined
        this.charValueChangeOnceCallbacks = undefined
        this.onConnectionClose()
      } else if (!this.globalData.isBLEConnected && result.connected) {
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
      }
      this.globalData.isBLEConnected = result.connected
    })
  },

  onConnectionClose(): void {
    wx.showModal({
      confirmText: "嗯嗯",
      title: "(ó﹏ò｡)蓝牙已断开，请重新连接!",
      showCancel: false,
      success: (res) => {
        if (res.confirm) {
          this.globalData.connectedDevice = undefined
          wx.offBLEConnectionStateChange(() => {})
          wx.redirectTo({url: "../index/index"})
        }
      }
    })
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
  }
  
})
