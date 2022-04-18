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
        this.onConnectionClose()
      } else if (!this.globalData.isBLEConnected && result.connected) {
        this.charValueChangeCallbacks = new Map();
        wx.onBLECharacteristicValueChange((result) => {
          var charId = result.characteristicId
          var cb = this.charValueChangeCallbacks?.get(charId)
          if (cb !== undefined) {
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
  }
})
