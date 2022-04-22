const app = getApp<IAppOption>()
import { Buffer } from 'buffer';

const SERVICE_UUID_WATER_ADJUSTER = "0000000D-0000-1000-8000-00805F9B34FB"
const CHAR_UUID_WATER_CONTROL = "00000D01-0000-1000-8000-00805F9B34FB"
const CHAR_UUID_WATER_SPEED = "00000D02-0000-1000-8000-00805F9B34FB"
const CHAR_UUID_WATER_ML_PER_SECOND = "00000D03-0000-1000-8000-00805F9B34FB"

const WATER_OP_START = 0
const WATER_OP_STOP = 1

Page({

  data: {
    menuButtonPosition: {} as WechatMiniprogram.Rect,
    deviceName: "" as string,
    adjustingTip: "" as string
  },
  deviceId: "" as string,
  isAdjusting: false as boolean,

  onLoad() {
    var deviceId = app.globalData.connectedDevice?.deviceId
    if (deviceId !== undefined) {
      this.deviceId = deviceId
    }

    app.getDeviceConfig(this.deviceId, "device-name").then((res) => {
      this.setData({
        deviceName: res
      })
    })

    this.setData({
      menuButtonPosition: wx.getMenuButtonBoundingClientRect(),
    })
  },

  onReady() {

  },

  onShow() {
  },

  onHide() {
  },

  onUnload() {

  },

  async btnAdjustWatering() {
    if (!this.isAdjusting) {
      var res = await wx.showModal({
        confirmText: "确定",
        content: '点击"确定"开始出水，再次点击"校准出水量"时停止出水，然后输入出水量即可完成校准。',
        editable: false,
        showCancel: true
      })

      await this.startWater()
      
      if (res.confirm) {
        this.isAdjusting = true
        this.setData({adjustingTip: "正在出水，点击停止"})
      }
    } else {
      var res = await wx.showModal({
        confirmText: "是的是的",
        content: '是否停止出水？',
        editable: false,
        showCancel: true
      })
      if (!res.confirm) { return }

      await this.stopWater()

      res = await wx.showModal({
        confirmText: "确定",
        title: "一共出了多少毫升的水呢？",
        editable: true,
        showCancel: true
      })
      if (!res.confirm) { return }

      this.isAdjusting = false
      this.setData({adjustingTip: ""})

      wx.showModal({
        confirmText: "嗯嗯",
        content: "校准成功！|●´∀`|σ",
        editable: false,
        showCancel: false 
      })
    }
  },

  async startWater() {
    var buffer = Buffer.alloc(1)
    buffer.writeUInt8(WATER_OP_START, 0)
    await wx.writeBLECharacteristicValue({
      deviceId: this.deviceId,
      serviceId: SERVICE_UUID_WATER_ADJUSTER,
      characteristicId: CHAR_UUID_WATER_CONTROL,
      value: buffer.buffer
    })
  },

  async stopWater() {
    var buffer = Buffer.alloc(1)
    buffer.writeUInt8(WATER_OP_STOP, 0)
    await wx.writeBLECharacteristicValue({
      deviceId: this.deviceId,
      serviceId: SERVICE_UUID_WATER_ADJUSTER,
      characteristicId: CHAR_UUID_WATER_CONTROL,
      value: buffer.buffer
    })
  },

  async btnRename() {
    var newDeviceName: string
    while (true) {
      var res = await wx.showModal({ confirmText: "确定", title: "新马甲:", editable: true, showCancel: true })
      newDeviceName = res.content
      if (res.confirm === true && newDeviceName.length === 0) {
        await wx.showModal({ title: "ヽ(｀Д´)ﾉ︵ ┻━┻ ┻━┻ 设备名不能为空！", confirmText: "嗯嗯",  editable: false, showCancel: false })
        continue
      }

      if (res.confirm === false) { return }

      break
    }

    wx.showToast({ title: "修改中", icon: 'loading', mask: true, duration: 10000 })

    try {
      await app.setDeviceConfig(this.deviceId, "device-name", newDeviceName)
      var checkName = await app.getDeviceConfig(this.deviceId, "device-name")
      if (checkName != newDeviceName) {
        wx.showToast({ title: "修改失败！", icon: 'error', mask: false, duration: 1000 })
        return
      }
      if (app.globalData.connectedDevice !== undefined) {
        app.globalData.connectedDevice.name = newDeviceName
        app.saveHistoryDevice(app.globalData.connectedDevice)
      }
      this.setData({deviceName: newDeviceName})
      wx.showToast({ title: "修改成功！", icon: 'error', mask: false, duration: 1000 })
    } catch(e) {
      wx.showToast({ title: "修改失败！", icon: 'error', mask: false, duration: 1000 })
    }
  }

})