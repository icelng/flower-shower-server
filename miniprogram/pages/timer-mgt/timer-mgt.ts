// pages/timer-mgt/timer-mgt.ts
const app = getApp<IAppOption>()
import { Buffer } from 'buffer';

const SERVICE_UUID_MOTOR_TIMER = "000000FF-0000-1000-8000-00805F9B34FB"
const CHAR_UUID_MOTOR_TIMER = "0000FF01-0000-1000-8000-00805F9B34FB"
const CHAR_UUID_SYSTEM_TIME = "0000FF02-0000-1000-8000-00805F9B34FB"

const MOTOR_TIMER_OP_ADD: number = 1
const MOTOR_TIMER_OP_MOD: number = 2
const MOTOR_TIMER_OP_DEL: number = 3
const MOTOR_TIMER_OP_START: number = 4
const MOTOR_TIMER_OP_STOP: number = 5

const MSECS_PER_SEC: number = 1000
const MSECS_PER_MINUTE: number = 60 * MSECS_PER_SEC
const MSECS_PER_HOUR: number = 60 * MSECS_PER_MINUTE
const MSECS_PER_DAY: number = 24 * MSECS_PER_HOUR

const DEFAULT_WATERING_STATUS: WateringStatus = {timerNo: 0, isWatering: false, minutesLeft: 0, secondsLeft: 0}

interface MotorTimer {
  timerNo: number,
  firstStartTimestampMs: number,
  periodMs: number,
  durationMs: number,
  speed: number
}

interface FormattedMotorTimer {
  timerNo: number,
  firstStartTime: string,
  duration: string,
}

interface NextWaterTime {
  daysLeft: number,
  hoursLeft: number,
  minutesLeft: number,
  secondsLeft: number,
  durationMinutes: number,
  durationSeconds: number
}

interface WateringStatus {
  timerNo: number,
  isWatering: boolean,
  minutesLeft: number,
  secondsLeft: number
}

Page({
  data: {
    slideButtons: [{
        type: 'warn',
        text: '删除',
    }],
    pickerMinutesSecsArray: [] as Array<Array<string>>,
    pickerAddDurationIndex: [] as Array<number>,
    isShowAddTimerContainer: false,
    pickAddStartTime: "13:00",
    // timers: [] as Array<FormattedMotorTimer>
    nextWaterTime: {} as NextWaterTime,
    wateringStatus: DEFAULT_WATERING_STATUS as WateringStatus,
    timers: [{timerNo: 2, firstStartTime: "6 时 12 分", duration: "3 分 12 秒"}] as Array<FormattedMotorTimer>,
  },

  device: {} as BLEDevice | undefined,
  isDeviceConnected: false,
  timerService: {} as WechatMiniprogram.BLEService,
  motorTimerChar: {} as WechatMiniprogram.BLECharacteristic,
  systemTimeChar: {} as WechatMiniprogram.BLECharacteristic,
  rawTimers: [] as Array<MotorTimer>,
  formattedTimers: [] as Array<FormattedMotorTimer>,
  refreshPageTimerNo: undefined as number | undefined,
  stoppedTimers: new Map<number, number>() as Map<number, number>,  // timerNo -> restoreTimestamp

  onLoad() {
    var minutes = []
    var secs = []
    for (let i = 0; i <= 60; i++) {
      minutes.push(i + "分")
      secs.push(i + "秒")
    }
    this.setData({pickerMinutesSecsArray: [minutes, secs]})

    this.device = app.globalData.connectedDevice
    if (this.device === undefined) {
      wx.showToast({ icon: 'error', title: "好像没连到设备！", duration: 3000 })
      return
    }

    const deviceId = this.device.deviceId
    wx.getBLEDeviceServices({
      deviceId: deviceId,
      success: (res) => {
        var isServiceFound = false
        for (let i = 0; i < res.services.length; i++) {
            if (res.services[i].uuid === SERVICE_UUID_MOTOR_TIMER) {
              this.timerService = res.services[i]
              isServiceFound = true;
              console.log("get timer service: ", this.timerService)
            }
        }

        if (!isServiceFound) {
          wx.showToast({ icon: 'error', title: "设备连错了- -！", duration: 3000 })
          return
        }

        wx.getBLEDeviceCharacteristics({
          deviceId: deviceId,
          serviceId: this.timerService.uuid,
          success: (res) => {
              for (let i = 0; i < res.characteristics.length; i++) {
                console.log("get char: ", res.characteristics[i])
                switch (res.characteristics[i].uuid) {
                  case CHAR_UUID_MOTOR_TIMER:
                    this.motorTimerChar = res.characteristics[i];
                    console.log("get timer char: " + JSON.stringify(this.motorTimerChar));
                    break;
                  case CHAR_UUID_SYSTEM_TIME:
                    this.systemTimeChar = res.characteristics[i];
                    console.log("get system time char: " + JSON.stringify(this.systemTimeChar));
                    break;

                }
              }
              this.listTimers()
              this.adjSystemTime()
              this.refreshPageTimerNo = setInterval(this.refreshPage, 1000)
          },
          fail: (err) => {
            console.log("failed to get charateristics!", err)
          }
        })

        wx.onBLECharacteristicValueChange(this.onBLECharacteristicValueChange)
      },
      fail: (err) => {
        console.log("failed to get services from device, id: " + deviceId, err)
      }
    })
  },

  refreshPage() {
    if (this.rawTimers.length === 0) {
      this.setData({timers: [], wateringStatus: DEFAULT_WATERING_STATUS})
      return
    }

    this.stoppedTimers = refreshStoppedTimers(this.stoppedTimers)
    this.rawTimers = sortMotorTimers(this.rawTimers, this.stoppedTimers)
    this.formattedTimers = formatTimers(this.rawTimers)
    var nextTimer = this.rawTimers[0]
    this.setData({
      timers: this.formattedTimers,
      nextWaterTime: calNextWaterTime(nextTimer),
      wateringStatus: getWateringStatus(nextTimer, this.stoppedTimers.has(nextTimer.timerNo))
    })
  },

  adjSystemTime() {
    if (this.device === undefined || this.systemTimeChar === undefined) {
      wx.showToast({ icon: 'error', title: "校准失败，请确认蓝牙已连接", duration: 1000 })
      return
    }

    var timestampMs: number = Date.now()

    var buffer = Buffer.alloc(8)
    buffer.writeUIntLE(timestampMs/1000, 0, 6)

    wx.showToast({ icon: 'loading', title: '操作中', mask: true, duration: 10000 })
    wx.writeBLECharacteristicValue({
      deviceId: this.device.deviceId,
      serviceId: this.timerService.uuid,
      characteristicId: this.systemTimeChar.uuid,
      value: buffer.buffer,
      fail: (err) => {
        wx.showToast({ icon: 'error', title: "时间校准失败，请确认蓝牙已连接", duration: 1000 })
        console.log(err);
      },
      success: () => {}
    })
  },

  btnStopTimer() {
    if (this.device === undefined || this.timerService === undefined || this.motorTimerChar === undefined) {
      wx.showToast({ icon: 'error', title: "请确认蓝牙已连接", duration: 1000 })
      return;
    }

    var wateringStatus = this.data.wateringStatus
    if (!wateringStatus.isWatering ||
        (wateringStatus.minutesLeft === 0 && wateringStatus.secondsLeft === 0)) {
      return
    }

    var timerNo = wateringStatus.timerNo
    var timer: MotorTimer | undefined = undefined
    for (let t of this.rawTimers) {
      if (t.timerNo === timerNo) {
        timer = t
      }
    }

    if (timer === undefined) {
      return
    }

    var msToStop = calTimeToStop(timer)
    if (msToStop === 0) { return }

    var buffer = Buffer.alloc(2)
    buffer.writeUInt8(MOTOR_TIMER_OP_STOP, 0)
    buffer.writeUInt8(timerNo, 1)
    wx.writeBLECharacteristicValue({
      deviceId: this.device.deviceId,
      serviceId: this.timerService.uuid,
      characteristicId: this.motorTimerChar.uuid,
      value: buffer.buffer,
      fail: (err) => {
        wx.showToast({ icon: 'error', title: "停止失败", duration: 1000 })
        console.log('failed to delete tiemr: write char value error, ', err)
      },
      success: () => {
        wx.showToast({icon: 'success', title: "停止成功", duration: 1000})
        this.stoppedTimers.set(timerNo, Date.now() + msToStop)
        this.refreshPage()
      }
    })
  },

  btnDeleteTimer(event: WechatMiniprogram.BaseEvent) {
    var itemIndex = event.currentTarget.dataset.itemIndex
    var timer = this.formattedTimers[itemIndex]
    wx.showModal({
      cancelText: "否",
      confirmText: "是",
      title: "是否删除定时器？",
      content: "开始时间: " + timer.firstStartTime + "\n 持续时间: " + timer.duration,
      showCancel: true,
      success: (res) => {
        if (res.confirm) {
          this.doDeleteTimer(timer.timerNo)
        }
      }
    })
  },

  // TODO(liang), reduce redundant codes about reading and writing charateristic
  doDeleteTimer(timerNo: number) {
    if (this.device === undefined || this.timerService === undefined || this.motorTimerChar === undefined) {
      wx.showToast({ icon: 'error', title: "删除定时失败，请确认蓝牙已连接", duration: 1000 })
      return;
    }

    var buffer = Buffer.alloc(2)
    buffer.writeUInt8(MOTOR_TIMER_OP_DEL, 0)
    buffer.writeUInt8(timerNo, 1)

    wx.showToast({ icon: 'loading', title: '', mask: true, duration: 10000 })

    wx.writeBLECharacteristicValue({
      deviceId: this.device.deviceId,
      serviceId: this.timerService.uuid,
      characteristicId: this.motorTimerChar.uuid,
      value: buffer.buffer,
      fail: (err) => {
        wx.showToast({ icon: 'error', title: "删除失败", duration: 1000 })
        console.log('failed to delete tiemr: write char value error, ', err)
      },
      success: () => {
        wx.showToast({icon: 'success', title: "删除成功", duration: 1000})
        this.listTimers()
      }
    })

  },

  btnAddTimer() {
    this.setData({
      pickAddStartTime: loadDefaultAddStartTime(),
      pickerAddDurationIndex: loadDefaultAddDuration(),
      isShowAddTimerContainer: true
    })
  },

  btnCancelAddTimer() {
    this.setData({isShowAddTimerContainer: false})
  },

  btnDoAddTimer() {
    if (this.device === undefined || this.timerService === undefined || this.motorTimerChar === undefined) {
      wx.showToast({ icon: 'error', title: "增加定时失败，请确认蓝牙已连接", duration: 1000 })
      return;
    }

    var durationMinutes = this.data.pickerAddDurationIndex[0]
    var durationSec = this.data.pickerAddDurationIndex[1]
    var durationMs = Number((durationMinutes * 60 + durationSec) * 1000)
    var startTimestamp = Date.parse("2022 1 1 " + this.data.pickAddStartTime + ":00")
    var periodMs = MSECS_PER_DAY
    console.log("do add timer, durationMs: " + durationMs + " startTimestamp: " + startTimestamp)
    var timerBuffer = encodeMotorTimer([{
      timerNo: 0,
      firstStartTimestampMs: startTimestamp,
      periodMs: periodMs,
      durationMs: durationMs,
      speed: 0.8
    }])

    var buffer = Buffer.alloc(1 + timerBuffer.length)
    buffer.writeUInt8(MOTOR_TIMER_OP_ADD, 0)
    timerBuffer.copy(buffer, 1, 0, timerBuffer.length)

    wx.showToast({ icon: 'loading', title: '', mask: true, duration: 10000 })
    wx.writeBLECharacteristicValue({
      deviceId: this.device.deviceId,
      serviceId: this.timerService.uuid,
      characteristicId: this.motorTimerChar.uuid,
      value: buffer.buffer,
      fail: (err) => {
        wx.showToast({ icon: 'error', title: "添加失败", duration: 1000 })
        console.log('failed to add tiemr: write char value error, ', err)
      },
      success: () => {
        wx.showToast({icon: 'success', title: "添加成功", duration: 1000})
        this.setData({isShowAddTimerContainer: false})
        this.listTimers()
        saveDefaultAddStartTime(this.data.pickAddStartTime)
        saveDefaultAddDuration(this.data.pickerAddDurationIndex)
      }
    })
  },

  onPickAddStartTimeChange(e: WechatMiniprogram.CustomEvent) {
    this.setData({pickAddStartTime: e.detail.value})
  },

  onPickAddDurationChange(e: WechatMiniprogram.CustomEvent) {
    this.setData({pickerAddDurationIndex: e.detail.value})
  },

  listTimers() {
    if (this.device === undefined) {
      return;
    }

    wx.showToast({
        title: "获取定时器列表",
        icon: 'loading',
        mask: true,
        duration: 10000
    })

    wx.readBLECharacteristicValue({
      deviceId: this.device.deviceId,
      serviceId: this.timerService.uuid,
      characteristicId: this.motorTimerChar.uuid,
      fail: (err) => {
        console.log("failed to read charateristic value!", err)
        wx.hideToast()
      }
    })
  },

  onBLECharacteristicValueChange(charateristic: WechatMiniprogram.OnBLECharacteristicValueChangeCallbackResult): void {
    switch(charateristic.characteristicId) {
      case CHAR_UUID_MOTOR_TIMER:
        this.receiveTimerList(charateristic.value)
        break;
      case CHAR_UUID_SYSTEM_TIME:
        break;
    }
  },

  checkBLEStatus() {
    if (this.device !== undefined && this.timerService !== undefined)
    wx.showModal({
      confirmText: "嗯嗯",
      title: "蓝牙已断开，请重新连接!(ó﹏ò｡)",
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({url: "../index/index"})
        }
      }
    })
  },

  receiveTimerList(value: ArrayBuffer): void {
    const buf = Buffer.from(value)
    this.rawTimers = decodeMotorTimers(buf)
    this.refreshPage()
    wx.hideToast()
  },

  onUnload() {
    if (this.refreshPageTimerNo !== undefined) {
      clearInterval(this.refreshPageTimerNo)
      this.refreshPageTimerNo = undefined
    }
  },

  onHide() {
    if (this.refreshPageTimerNo !== undefined) {
      clearInterval(this.refreshPageTimerNo)
      this.refreshPageTimerNo = undefined
    }
  },

  
  onShow() {
    if (this.refreshPageTimerNo === undefined) {
      this.refreshPageTimerNo = setInterval(this.refreshPage, 1000)
    }
  }

})

function decodeMotorTimers(buffer: Buffer): Array<MotorTimer> {
  var num_timers = buffer.readUInt8(0)
  var timers = []
  var offset = 1
  for (let i = 0; i < num_timers; i++) {
    var timer: MotorTimer = {
      timerNo: buffer.readUInt8(offset),
      firstStartTimestampMs: Number(buffer.readBigUInt64LE(offset + 1)),
      periodMs: Number(buffer.readBigUInt64LE(offset + 9)),
      durationMs: Number(buffer.readBigUInt64LE(offset + 17)),
      speed: Number(buffer.readFloatLE(offset + 25))
    }
    timers.push(timer)
    offset += 29
  }

  return timers
}

function encodeMotorTimer(timers: Array<MotorTimer>): Buffer {
  var buffer = Buffer.alloc(1 + timers.length * 29)

  buffer.writeUInt8(timers.length, 0)
  var offset = 1
  for (let i = 0; i < timers.length; i++) {
    var timer: MotorTimer = timers[i]
    buffer.writeUInt8(timer.timerNo, offset)
    buffer.writeUIntLE(timer.firstStartTimestampMs, offset + 1, 6)
    buffer.writeUIntLE(timer.periodMs, offset + 9, 6)
    buffer.writeUIntLE(timer.durationMs, offset + 17, 6)
    buffer.writeFloatLE(timer.speed, offset + 25)
    offset += 29
  }

  return buffer
}

function sortMotorTimers(timers: Array<MotorTimer>, stoppedTimers: Map<number, number>): Array<MotorTimer> {
  var sortedTimers = timers.sort((a, b): number => {
    if ((stoppedTimers.has(a.timerNo) && stoppedTimers.has(b.timerNo)) ||
        (!stoppedTimers.has(a.timerNo) && !stoppedTimers.has(b.timerNo))) {
      return calTimeToStart(a) - calTimeToStart(b)
    } else if (stoppedTimers.has(a. timerNo)) {
      return 1
    } else {
      return -1
    }
  })
  return sortedTimers
}

function calNextWaterTime(timer: MotorTimer): NextWaterTime {
  var nowTimestamp = Date.now()
  var msToStart: number = 0

  if (nowTimestamp <= timer.firstStartTimestampMs) {
    msToStart = timer.firstStartTimestampMs - nowTimestamp
  } else {
    var goneMsInPeriod = (nowTimestamp - timer.firstStartTimestampMs) % timer.periodMs
    msToStart = timer.periodMs - goneMsInPeriod
  }

  var nextWaterTime: NextWaterTime = {
    daysLeft: Math.floor(msToStart / MSECS_PER_DAY),
    hoursLeft: Math.floor((msToStart % MSECS_PER_DAY) / MSECS_PER_HOUR),
    minutesLeft: Math.floor((msToStart % MSECS_PER_HOUR) / MSECS_PER_MINUTE),
    secondsLeft: Math.floor((msToStart % MSECS_PER_MINUTE) / MSECS_PER_SEC),
    durationMinutes: Math.floor((timer.durationMs % MSECS_PER_HOUR) / MSECS_PER_MINUTE),
    durationSeconds: Math.floor((timer.durationMs % MSECS_PER_MINUTE) / MSECS_PER_SEC)
  }

  return nextWaterTime
}

function getWateringStatus(timer: MotorTimer, isStopped: boolean): WateringStatus {
  var msToStop = calTimeToStop(timer)

  var wateringStatus: WateringStatus = {
    timerNo: timer.timerNo,
    isWatering: !isStopped && msToStop !== 0,
    minutesLeft: Math.floor((msToStop % MSECS_PER_HOUR) / MSECS_PER_MINUTE),
    secondsLeft: Math.floor((msToStop % MSECS_PER_MINUTE) / MSECS_PER_SEC)
  }

  return wateringStatus
}

function formatTimers(rawTimers: Array<MotorTimer>): Array<FormattedMotorTimer> {
    var formattedTimers: Array<FormattedMotorTimer> = []
    for (let i = 0; i < rawTimers.length; i++) {
      let timer = rawTimers[i]
      var formattedTimer: FormattedMotorTimer = {
        timerNo: timer.timerNo,
        firstStartTime: formatTimestamp(timer.firstStartTimestampMs),
        duration: formatDuration(timer.durationMs),
      }
      formattedTimers.push(formattedTimer)
    }

    return formattedTimers
}

function calTimeToStart(timer: MotorTimer): number {
  var nowTimestamp = Date.now()
  var msToStart: number = 0

  if (nowTimestamp <= timer.firstStartTimestampMs) {
    msToStart = timer.firstStartTimestampMs - nowTimestamp
  } else {
    var goneMsInPeriod = (nowTimestamp - timer.firstStartTimestampMs) % timer.periodMs
    if (goneMsInPeriod < timer.durationMs) {
      msToStart = 0  // is watering
    } else {
      msToStart = timer.periodMs - goneMsInPeriod
    }
  }

  return msToStart
}

function calTimeToStop(timer: MotorTimer): number {
  var nowTimestamp = Date.now()
  if (nowTimestamp < timer.firstStartTimestampMs) {
    return 0
  }
  var goneMsInPeriod = (nowTimestamp - timer.firstStartTimestampMs) % timer.periodMs
  return (goneMsInPeriod < timer.durationMs)? (timer.durationMs - goneMsInPeriod) : 0
}

function refreshStoppedTimers(stoppedTimers: Map<number, number>): Map<number, number> {
  var nowTimestamp = Date.now()
  var newStoppedTimers = new Map<number, number>()
  stoppedTimers.forEach((restoreTimestamp, timerNo) => {
    // If now timestamp is lower than restore timestamp,
    // the timer should not be removed from stopped timers map
    if (nowTimestamp < restoreTimestamp) {
      newStoppedTimers.set(timerNo, restoreTimestamp)
    }
  })
  return newStoppedTimers
}

function formatTimestamp(timestamp: number): string {
  var date = new Date(timestamp)
  var hours = date.getHours();
  var minutes = date.getMinutes();
  return hours + " 时 " + minutes + " 分 "
}

function formatDuration(durationMs: number): string {
  var durationSec: number = durationMs / 1000
  return (durationSec >= 60? Math.floor(durationSec / 60) + " 分 " : "") + durationSec % 60 + " 秒"
}

function saveDefaultAddStartTime(time: string): void {
  wx.setStorageSync<string>("df-add-start-time", time)
}

function loadDefaultAddStartTime(): string {
  try{
    var time = wx.getStorageSync<string>("df-add-start-time")
    if (time === "") return "12:00"
    return time
  } catch(e) {
    return "12:00"
  }
}

function saveDefaultAddDuration(duration: Array<number>): void {
  wx.setStorageSync<Array<number>>("df-add-duration", duration)
}
 
function loadDefaultAddDuration(): Array<number> {
  try{
    var duration = wx.getStorageSync<Array<number>>("df-add-duration")
    if (duration.length === 0) return [1, 1]
    return duration
  } catch(e) {
    return [1, 1]
  }
}