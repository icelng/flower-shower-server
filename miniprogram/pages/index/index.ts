// index.ts
// 获取应用实例
const app = getApp<IAppOption>()

Page({
  data: {
    slideButtons:[{type: "", text: "", src: ""}],
    devices: [] as Array<BLEDevice>,
    historyDevices: [] as Array<BLEDevice>,
    hasHistoryDevice: false,
    showScanContainer: false,
    isScanning: false,
    isBLEInitied: false,
    isConnectDisabled: false,
  },
  devicesFound: [] as Array<BLEDevice>,
  // 事件处理函数
  bindViewTap() {
    wx.navigateTo({
      url: '../logs/logs'
    })
  },

  btnShowScanContainer() {
    this.setData({showScanContainer: true})
  },

  onScanContainerEnter() {
    this.btnStartScanning()
  },

  btnStartScanning() {
    this.setData({isScanning: true})
    if (this.data.isBLEInitied) {
      wx.startBluetoothDevicesDiscovery({
        allowDuplicatesKey: false,
      })
    }
  },

  stopScanning() {
    wx.stopBluetoothDevicesDiscovery()
    this.setData({isScanning: false})
  },

  onScanContainerLeave() {
    this.stopScanning()
  },

  btnRemoveHistoryDevice(event : WechatMiniprogram.BaseEvent) {
    var devices = this.data.historyDevices
    var index = event.currentTarget.dataset.itemIndex
    var device = devices[index]
    this.removeHistoryDevice(device.deviceId)
    devices.splice(index, 1)
    this.setData({historyDevices: devices})
  },

  btnConnectDevice(event : WechatMiniprogram.BaseEvent) {
    var device = this.devicesFound[event.currentTarget.dataset.itemIndex]
    this.stopScanning()
    this.connectDeivce(device)
  },

  btnConnectHistoryDevice(event : WechatMiniprogram.BaseEvent) {
    var device = this.data['historyDevices'][event.currentTarget.dataset.itemIndex]
    this.connectDeivce(device)
  },
  
  connectDeivce(device: BLEDevice) {
    wx.showToast({
        title: "正在连接设备",
        icon: 'loading',
        mask: true,
        duration: 10000
    })

    this.setData({isConnectDisabled: true})

    wx.createBLEConnection({
      deviceId: device.deviceId,
      success: () => {
        wx.hideToast()
        var connectedDevice:BLEDevice = {name: device.name, deviceId: device.deviceId}
        app.globalData.connectedDevice = connectedDevice
        this.saveHistoryDevice(connectedDevice)
        wx.switchTab({
          url: '../timer-mgt/timer-mgt',
          success: () => {

          }
        })
      },
      fail: () => {
        wx.showToast({
            title: "连接失败！",
            icon: 'error',
            mask: false,
            duration: 1000
        })
      },
      complete: () => {
        this.setData({isConnectDisabled: false})
      },
      timeout: 10000
    })
    console.log("connect device: " + device.name)
  },

  saveHistoryDevice(device: BLEDevice) {
    wx.setStorageSync("hd-" + device.deviceId, device)
  },

  getHistoryDevice(deviceId: string) {
    try {
      return wx.getStorageSync("hd-" + deviceId)
    } catch (e) {
      console.log(e)
    }
  },

  listHistoryDevices() {
    wx.getStorageInfo({
      success: (res) => {
        let devices = []
        for (let i = 0; i < res.keys.length; i++) {
          let key = res.keys[i]
          if (key.substring(0, 3) === "hd-") {
            let device = this.getHistoryDevice(key.substring(3, key.length));
            devices.push(device)
          }
        }
        if (devices.length > 0) {
          this.setData({hasHistoryDevice: true})
        } else {
          this.setData({hasHistoryDevice: false})
        }
        this.setData({historyDevices: devices})
      }
    })
  },

  removeHistoryDevice(deviceId: string) {
    wx.removeStorageSync("hd-" + deviceId)
  },

  onShow() {
    if (app.globalData.connectedDevice !== undefined) {
      wx.closeBLEConnection({deviceId: app.globalData.connectedDevice.deviceId})
      app.globalData.connectedDevice = undefined
    }
    this.listHistoryDevices()
  },

  onLoad() {

    // wx.switchTab({
    //   url: '../timer-mgt/timer-mgt',
    //   success: () => {

    //   }
    // })

    wx.switchTab({
      url: '../humidity/humidity',
      success: () => {

      }
    })

    wx.openBluetoothAdapter({
      mode: 'central',
      success: () => {
        console.log("init BLE successfully!")
        this.setData({isBLEInitied: true})
      },
      fail: () => {
        this.setData({isBLEInitied: false})
        console.log("init BLE failed!")
      }
    })

    // 监听扫描到新设备事件
    wx.onBluetoothDeviceFound((res) => {
      res.devices.forEach((device) => {
        if (device.name.length === 0) return
        this.devicesFound.push({name: device.name, deviceId: device.deviceId})
        this.setData({devices: this.devicesFound})
        console.log('Device Found', device)
      })
    })

    this.setData({
      slideButtons: [{
        type: 'warn',
        text: '删除',
        src: '/images/icon_del.svg', // icon的路径
      }],
    })
}
})