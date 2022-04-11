const app = getApp()
import { Buffer } from 'buffer';

const SERVICE_UUID_MOTOR_TIMER = "000000FF-0000-1000-8000-00805F9B34FB";
const SERVICE_UUID_SYSTEM_TIME = "000000FE-0000-1000-8000-00805F9B34FB"

const CHAR_UUID_CONTROL_MOTOR = "0000FF03-0000-1000-8000-00805F9B34FB"
const CHAR_UUID_SYSTEM_TIME = "0000FE01-0000-1000-8000-00805F9B34FB"

Page({
  data: {
    pickerMinutesSecsArray: [],
    pickerAddDurationIndex: [3, 3],
    isShowAddTimerContainer: false,
    pickAddStartTime: "12:00",
    device: "",
    timers: {}
  },
  device: {},
  isDeviceConnected: false,
  primaryService: undefined,
  systemTimeService: undefined,
  systemTimeChar: undefined,
  motorChars: [],
  formattedTimers: {},

  onLoad() {
    var minutes = []
    var secs = []
    for (let i = 0; i <= 60; i++) {
      minutes.push(i + "分")
      secs.push(i + "秒")
    }
    this.setData({pickerMinutesSecsArray: [minutes, secs]})

    const eventChannel = this.getOpenerEventChannel()
    const this_ = this
    eventChannel.on('connectedDevice', function(device) {
      this_.device = device
      wx.getBLEDeviceServices({
        deviceId: this_.device.deviceId,
        success: (res) => {
          this_.isDeviceConnected = true;
          for (let i = 0; i < res.services.length; i++) {
              if (res.services[i].uuid === SERVICE_UUID_MOTOR_TIMER) {
                this_.primaryService = res.services[i]
                console.log("get primary service: ", this_.primaryService)
              }
              if (res.services[i].uuid === SERVICE_UUID_SYSTEM_TIME) {
                this_.systemTimeService = res.services[i]
                console.log("get system time service: ", this_.systemTimeService)
              }
          }
          if (this_.primaryService) {
            wx.getBLEDeviceCharacteristics({
              deviceId: this_.device.deviceId,
              serviceId: this_.primaryService.uuid,
              success: (res) => {
                 for (let i = 0; i < res.characteristics.length; i++) {
                   console.log("get char: ", res.characteristics[i])
                   this_.motorChars.push(res.characteristics[i])
                 }
                 this_.listTimers()
              },
              fail: (err) => {
                console.log("failed to get charateristics!", err)
              }
            })
          }

          if (this_.systemTimeService) {
            wx.getBLEDeviceCharacteristics({
              deviceId: this_.device.deviceId,
              serviceId: this_.systemTimeService.uuid,
              success: (res) => {
                 for (let i = 0; i < res.characteristics.length; i++) {
                   if (res.characteristics[i].uuid === CHAR_UUID_SYSTEM_TIME) {
                     this_.systemTimeChar = res.characteristics[i]
                   }
                 }
              },
              fail: (err) => {
                console.log("failed to get charateristics!", err)
              }
            })
          }

          wx.onBLECharacteristicValueChange(this_.onBLECharacteristicValueChange)
        },
        fail: (err) => {
          console.log("failed to get services from device, id: " + deviceId, err)
        }
      })
    })
  },

  onUnload() {
    wx.closeBLEConnection({
      deviceId: this.data.device.deviceId,
    })
  },

  btnAdjSystemTime() {
    if (this.systemTimeChar === undefined) {
      wx.showToast({ icon: 'error', title: "校准失败，请确认蓝牙已连接", duration: 1000 })
      return
    }

    var timestampMs = Date.parse(new Date())

    var buffer = Buffer.alloc(8)
    buffer.writeUIntLE(timestampMs/1000, 0, 6)

    wx.showToast({ icon: 'loading', title: '操作中', mask: true, duration: 10000 })
    wx.writeBLECharacteristicValue({
      deviceId: this.device.deviceId,
      serviceId: this.systemTimeService.uuid,
      characteristicId: this.systemTimeChar.uuid,
      value: buffer.buffer,
      fail: (err) => {
        wx.showToast({ icon: 'error', title: "操作失败", duration: 1000 })
      },
      success: (res) => {
        wx.showToast({icon: 'success', title: '操作成功', duration: 1000})
      }
    })
  },

  btnStartMotor() {
    this.controlMotor(true)
  },

  btnStopMotor() {
    this.controlMotor(false)
  },

  controlMotor(isStart) {
    var controlMotorChar
    for (let i = 0; i < this.motorChars.length; i++) {
      if (this.motorChars[i].uuid === CHAR_UUID_CONTROL_MOTOR) {
        controlMotorChar = this.motorChars[i]
      }
    }

    if (controlMotorChar === undefined) {
      console.log('control motor char not found! char uuid: ' + CHAR_UUID_CONTROL_MOTOR)
      return
    }

    var buffer = Buffer.alloc(1)
    if (isStart) {
      buffer.writeUint8(1)
    } else {
      buffer.writeUint8(0)
    }

    wx.showToast({ icon: 'loading', title: '操作中', mask: true, duration: 10000 })
    wx.writeBLECharacteristicValue({
      deviceId: this.device.deviceId,
      serviceId: this.primaryService.uuid,
      characteristicId: controlMotorChar.uuid,
      value: buffer.buffer,
      fail: (err) => {
        wx.showToast({ icon: 'error', title: "操作失败", duration: 1000 })
        console.log('failed to contorl motor: write char value error, ', err)
      },
      success: (res) => {
        wx.showToast({icon: 'success', title: '操作成功', duration: 1000})
      }
    })
  },

  btnDeleteTimer(event) {
    var timerNo = event.currentTarget.dataset.timerNo
    var timer = this.formattedTimers[timerNo]
    wx.showModal({
      cancelText: "否",
      confirmText: "是",
      title: "是否删除定时器？",
      content: "开始时间: " + timer['startTime'] + "\n 持续时间: " + timer['duration'],
      showCancel: true,
      success: (res) => {
        if (res.confirm) {
          this.doDeleteTimer(timerNo)
        }
      }
    })
  },

  // TODO(liang), reduce redundant codes about reading and writing charateristic
  doDeleteTimer(timerNo) {
    var buffer = Buffer.alloc(1)
    buffer.writeUint8(Number(timerNo))

    var deleteTimerChar
    for (let i = 0; i < this.motorChars.length; i++) {
      if (this.motorChars[i].uuid === "0000FF02-0000-1000-8000-00805F9B34FB") {
        deleteTimerChar = this.motorChars[i]
      }
    }

    if (deleteTimerChar === undefined) {
      console.log('failed to delete timer, char not found! uuid: ' + '0000FF02-0000-1000-8000-00805F9B34FB')
      return
    }

    wx.showToast({ icon: 'loading', mask: true, duration: 10000 })

    wx.writeBLECharacteristicValue({
      deviceId: this.device.deviceId,
      serviceId: this.primaryService.uuid,
      characteristicId: deleteTimerChar.uuid,
      value: buffer.buffer,
      fail: (err) => {
        wx.showToast({ icon: 'error', title: "删除失败", duration: 1000 })
        console.log('failed to delete tiemr: write char value error, ', err)
      },
      success: (res) => {
        wx.showToast({icon: 'success', title: "删除成功", duration: 1000})
        delete this.formattedTimers[timerNo]
        this.setData({timers: this.formattedTimers})
      }
    })

  },

  btnAddTimer() {
    this.setData({isShowAddTimerContainer: true})
  },

  btnCancelAddTimer() {
    this.setData({isShowAddTimerContainer: false})
  },

  btnDoAddTimer() {
    var durationMinutes = this.data.pickerAddDurationIndex[0]
    var durationSec = this.data.pickerAddDurationIndex[1]
    var durationMs = Number((durationMinutes * 60 + durationSec) * 1000)
    var startTimestamp = Date.parse("2022 1 1 " + this.data.pickAddStartTime + ":00")
    var periodMs = 86400000  // one day
    console.log("do add timer, durationMs: " + durationMs + " startTimestamp: " + startTimestamp)
    var timerBuffer = encodeMotorTimer([{
      timerNo: 0,
      startTimestamp: startTimestamp,
      periodMs: periodMs,
      durationMs: durationMs,
      speed: 0.8
    }])

    var addTimerChar
    for (let i = 0; i < this.motorChars.length; i++) {
      if (this.motorChars[i].uuid === "0000FF01-0000-1000-8000-00805F9B34FB") {
        addTimerChar = this.motorChars[i]
      }
    }

    if (addTimerChar === undefined) {
      console.log('failed to add timer, char not found! uuid: ' + '0000FF01-0000-1000-8000-00805F9B34FB')
      return
    }

    wx.showToast({ icon: 'loading', mask: true, duration: 10000 })
    wx.writeBLECharacteristicValue({
      deviceId: this.device.deviceId,
      serviceId: this.primaryService.uuid,
      characteristicId: addTimerChar.uuid,
      value: timerBuffer.buffer,
      fail: (err) => {
        wx.showToast({ icon: 'error', title: "添加失败", duration: 1000 })
        console.log('failed to add tiemr: write char value error, ', err)
      },
      success: (res) => {
        wx.showToast({icon: 'success', title: "添加成功", duration: 1000})
        this.setData({isShowAddTimerContainer: false})
        this.listTimers()
      }
    })
  },
  onPickAddStartTimeChange(e) {
    this.setData({pickAddStartTime: e.detail.value})
  },
  onPickAddDurationChange(e) {
    this.setData({pickerAddDurationIndex: e.detail.value})
  },
  listTimers() {
    var timerChar
    for (let i = 0; i < this.motorChars.length; i++) {
      if (this.motorChars[i].uuid === "0000FF04-0000-1000-8000-00805F9B34FB") {
        timerChar = this.motorChars[i]
      }
    }

    if (timerChar === undefined) {
      return
    }

    wx.showToast({
        title: "获取定时器列表",
        icon: 'loading',
        mask: true,
        duration: 10000
    })

    wx.readBLECharacteristicValue({
      deviceId: this.device.deviceId,
      serviceId: this.primaryService.uuid,
      characteristicId: timerChar.uuid,
      fail: (err) => {
        console.log("failed to read charateristic value!", err)
        wx.hideToast()
      }
    })
  },

  onBLECharacteristicValueChange(charateristic) {
    const buf = Buffer.from(charateristic.value)
    const timers = decodeMotorTimers(buf)
    this.formattedTimers = {}
    for (let i = 0; i < timers.length; i++) {
      let timer = timers[i]
      var formattedTimer = {}
      formattedTimer['timerNo'] = timer['timerNo']
      formattedTimer['startTime'] = formatTimestamp(timer['firstStartTimestamp'])
      formattedTimer['duration'] = formatDuration(timer['durationMs'])
      this.formattedTimers[timer['timerNo']] = formattedTimer
    }
    this.setData({timers: this.formattedTimers})
    wx.hideToast()
  },

  onUnload() {
    if (this.isDeviceConnected) {
      wx.closeBLEConnection({
        deviceId: this.device.deviceId,
      })
    }
  }
})
function ab2hex(buffer) {
  let hexArr = Array.prototype.map.call(
    new Uint8Array(buffer),
    function(bit) {
      return ('00' + bit.toString(16)).slice(-2)
    }
  )
  return hexArr.join('');
}

function decodeMotorTimers(buffer) {
  var num_timers = buffer.readUint8(0)
  var timers = []
  var offset = 1
  for (let i = 0; i < num_timers; i++) {
    var timer = {}
    timer['timerNo'] = buffer.readUint8(offset)
    timer['firstStartTimestamp'] = Number(buffer.readBigUInt64LE(offset + 1, 8))
    timer['periodMs'] = Number(buffer.readBigUInt64LE(offset + 9, 8))
    timer['durationMs'] = Number(buffer.readBigUInt64LE(offset + 17, 8))
    timer['speed'] = buffer.readFloatLE(offset + 25, 4)
    timers.push(timer)
    offset += 29
  }
  return timers
}

function encodeMotorTimer(timers) {
  var buffer = Buffer.alloc(1 + timers.length * 29)

  buffer.writeUint8(timers.length)
  var offset = 1
  for (let i = 0; i < timers.length; i++) {
    var timer = timers[i]
    buffer.writeUInt8(timer.timerNo, offset)
    buffer.writeUIntLE(timer.startTimestamp, offset + 1, 6)
    buffer.writeUIntLE(timer.periodMs, offset + 9, 6)
    buffer.writeUIntLE(timer.durationMs, offset + 17, 6)
    buffer.writeFloatLE(timer.speed, offset + 25)
    offset += 29
  }

  return buffer
}

function formatTimestamp(timestamp) {
  var date = new Date(timestamp)
  var hours = date.getHours();
  var minutes = date.getMinutes();
  return hours + ' 时 ' + minutes + ' 分 '
}

function formatDuration(durationMs) {
  var durationSec = parseInt(durationMs / 1000)
  if (durationSec < 60) {
    return durationSec + ' 秒 '
  } else {
    return parseInt(durationSec / 60) + ' 分 ' + durationSec % 60 + ' 秒'
  }
}