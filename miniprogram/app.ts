// app.ts
App<IAppOption>({
  globalData: {

  },

  onLaunch() {
    wx.onBLEConnectionStateChange((result: WechatMiniprogram.OnBLEConnectionStateChangeCallbackResult) => {
      console.log("BLE connection change! deviceId: ", result.deviceId)
      if (!result.connected) {
        this.onConnectionClose()
      }
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
  }

})
