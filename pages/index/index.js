// index.js
// 获取应用实例
const app = getApp()

Page({
  data: {
    slideButtons:[],
    devices: [{name: "silicon dreams", deviceId: "123456"}],
    historyDevices: [],
    hasHistoryDevice: false,
    showScanContainer: false,
    isScanning: false,
    isBLEInitied: false,
    isConnectDisabled: false,
    motto: 'Hello World',
    userInfo: {},
    hasUserInfo: false,
    canIUse: wx.canIUse('button.open-type.getUserInfo'),
    canIUseGetUserProfile: false,
    canIUseOpenData: wx.canIUse('open-data.type.userAvatarUrl') && wx.canIUse('open-data.type.userNickName') // 如需尝试获取用户信息可改为false
  },
  bleDevices: [],
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

  btnRemoveHistoryDevice(event) {
    var devices = this.data.historyDevices
    var index = event.currentTarget.dataset.itemIndex
    var device = devices[index]
    this.removeHistoryDevice(device.deviceId)
    devices.splice(index, 1)
    this.setData({historyDevices: devices})
  },

  btnConnectDevice(event) {
    var device = this.bleDevices[event.currentTarget.dataset.itemIndex]
    this.stopScanning()
    this.connectDeivce(device)
  },

  btnConnectHistoryDevice(event) {
    var device = this.data['historyDevices'][event.currentTarget.dataset.itemIndex]
    this.connectDeivce(device)
  },
  
  connectDeivce(device) {
    wx.showToast({
        title: "正在连接设备",
        icon: 'loading',
        mask: true,
        duration: 10000
    })

    this.setData({isConnectDisabled: true})

    wx.createBLEConnection({
      deviceId: device.deviceId,
      success: (res) => {
        wx.hideToast()
        this.saveHistoryDevice({name: device.name, deviceId: device.deviceId})
        wx.navigateTo({
          url: '../main/main',
            success: function(res) {
              // 通过eventChannel向被打开页面传送数据
              res.eventChannel.emit('connectedDevice', device)
            }
        })
      },
      fail: (err) => {
        wx.showToast({
            title: "连接失败！",
            icon: 'error',
            mask: false,
            duration: 1000
        })
      },
      complete: (err) => {
        this.setData({isConnectDisabled: false})
      },
      timeout: 10000
    })
    console.log("connect device: " + device.name)
  },

  saveHistoryDevice(device) {
    wx.setStorageSync("hd-" + device.deviceId, device)
  },

  getHistoryDevice(deviceId) {
    try {
      return wx.getStorageSync("hd-" + deviceId)
    } catch (e) {
      console.log(e)
    }
  },

  listHistoryDevices() {
    const this_ = this
    wx.getStorageInfo({
      success (res) {
        let devices = []
        for (let i = 0; i < res.keys.length; i++) {
          let key = res.keys[i]
          if (key.substring(0, 3) === "hd-") {
            let device = this_.getHistoryDevice(key.substring(3, key.length));
            devices.push(device)
          }
        }
        if (devices.length > 0) {
          this_.setData({hasHistoryDevice: true})
        } else {
          this_.setData({hasHistoryDevice: false})
        }
        this_.setData({historyDevices: devices})
      }
    })
  },

  removeHistoryDevice(deviceId) {
    wx.removeStorageSync("hd-" + deviceId)
  },

  onShow() {
    this.listHistoryDevices()
  },

  onLoad() {
    wx.openBluetoothAdapter({
      mode: 'central',
      success: (res) => {
        console.log("init BLE successfully!")
        this.setData({isBLEInitied: true})
      },
      fail: (res) => {
        this.setData({isBLEInitied: false})
        console.log("init BLE failed!")
      }
    })

    // 监听扫描到新设备事件
    wx.onBluetoothDeviceFound((res) => {
      res.devices.forEach((device) => {
        if (device.name.length === 0) return
        this.bleDevices.push({name: device.name, deviceId: device.deviceId})
        this.setData({devices: this.bleDevices})
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
