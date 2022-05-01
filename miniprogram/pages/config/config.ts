const app = getApp<IAppOption>()
import { Buffer } from 'buffer';
import { Constants } from '../../app';

const ADVICE_ADJ_WATER_TIME_SEC = 60

Page({

  data: {
    menuButtonPosition: {} as WechatMiniprogram.Rect,
    deviceName: "" as string,
    adjustingTip: "" as string
  },
  deviceId: "" as string,
  isAdjusting: false as boolean,
  startAdjWaterTimestmpMs: 0 as number,

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
        content: '点击"确定"开始出水，再次点击"校准出水量"时停止出水，最后输入出水量即可完成校准。',
        editable: false,
        showCancel: true
      })
      
      if (res.confirm) {
        await this.startWater()
        this.startAdjWaterTimestmpMs = Date.now()
        this.isAdjusting = true
        this.setData({adjustingTip: "正在出水，点击停止"})
      }
    } else {
      var contentInStopModal: string
      var confirmTextInStopModal: string
      if ((Date.now() - this.startAdjWaterTimestmpMs) / 1000 < ADVICE_ADJ_WATER_TIME_SEC) {
        contentInStopModal = "是否停止出水?\n(还没超过 " + ADVICE_ADJ_WATER_TIME_SEC + " 秒，建议再等等)"
        confirmTextInStopModal = "现在就停"
      } else {
        contentInStopModal = "是否停止出水?"
        confirmTextInStopModal = "嗯嗯"
      }
      var res = await wx.showModal({
        confirmText: confirmTextInStopModal,
        content: contentInStopModal,
        editable: false,
        showCancel: true
      })
      if (!res.confirm) { return }

      await this.stopWater()
      this.isAdjusting = false
      this.setData({adjustingTip: ""})

      var ml: number
      var stopAdjWaterTimestampMs: number = Date.now()
      while (true) {
        res = await wx.showModal({
          confirmText: "确定",
          title: "一共出了多少毫升的水呢？",
          editable: true,
          showCancel: true
        })
        if (!res.confirm) { return }
        if (res.content.length === 0) {
          await wx.showModal({
            content: "(｡・`ω´･)输入不能为空！",
            confirmText: "知道了",
            editable: false,
            showCancel: false
          })
          continue;
        }
        ml = Number(res.content)
        if (isNaN(ml)) {
          await wx.showModal({
            content: "￣ω￣=你好像输入了非数字内容哦~~~",
            confirmText: "被发现了",
            editable: false,
            showCancel: false
          })
          continue;
        }

        break;
      }

      var elapse = (stopAdjWaterTimestampMs - this.startAdjWaterTimestmpMs) / 1000
      var mlPerSec = ml / elapse

      this.updateMLToDevice(mlPerSec).then(() => {
        wx.showModal({
          confirmText: "嗯嗯",
          content: "|●´∀`|σ校准成功!\n每秒出水量是: " + mlPerSec.toFixed(3) + " ml",
          editable: false,
          showCancel: false
        })
      }).catch((err) => {
        wx.showModal({
          confirmText: "ook",
          content: "(T＿T)校准失败，设备好像出了点问题!!错误信息: " + err,
          editable: false,
          showCancel: false
        })
      })
    }
  },

  async startWater() {
    var buffer = Buffer.alloc(1)
    buffer.writeUInt8(Constants.WATER_CONTROL_OP_START, 0)
    wx.showToast({ title: "开始中", icon: 'loading', mask: true, duration: 15000})
    await wx.writeBLECharacteristicValue({
      deviceId: this.deviceId,
      serviceId: Constants.SERVICE_UUID_WATER_TIMER,
      characteristicId: Constants.CHAR_UUID_WATER_CONTROL,
      value: buffer.buffer
    })
    wx.hideToast()
  },

  async stopWater() {
    var buffer = Buffer.alloc(1)
    buffer.writeUInt8(Constants.WATER_CONTROL_OP_STOP, 0)
    wx.showToast({ title: "停止中", icon: 'loading', mask: true, duration: 15000})
    await wx.writeBLECharacteristicValue({
      deviceId: this.deviceId,
      serviceId: Constants.SERVICE_UUID_WATER_TIMER,
      characteristicId: Constants.CHAR_UUID_WATER_CONTROL,
      value: buffer.buffer
    })
    wx.hideToast()
  },

  async updateMLToDevice(ml: number): Promise<void> {
    var buffer = Buffer.alloc(4)
    buffer.writeFloatLE(ml, 0)
    wx.showToast({ title: "校准中", icon: 'loading', mask: true, duration: 15000})
    await wx.writeBLECharacteristicValue({
      deviceId: this.deviceId,
      serviceId: Constants.SERVICE_UUID_WATER_TIMER,
      characteristicId: Constants.CHAR_UUID_WATER_MLPERSEC,
      value: buffer.buffer
    })
    wx.hideToast()
  },

  async btnModPassword() {
    var password = await app.getDeviceConfig(this.deviceId, "password")
    await wx.showModal({ confirmText: "知道了",
      content: `"${password}" 是改变不了的\n(｀・ω・´)`,
      editable: false,
      showCancel: false
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