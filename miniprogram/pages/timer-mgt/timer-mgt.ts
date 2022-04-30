// pages/timer-mgt/timer-mgt.ts
const app = getApp<IAppOption>()
import { Buffer } from 'buffer';

const SERVICE_UUID_WATER_TIMER = "000000FE-0000-1000-8000-00805F9B34FB"
const CHAR_UUID_WATER_TIMER = "0000FE01-0000-1000-8000-00805F9B34FB"
const CHAR_UUID_WATER_CONTROL = "0000FE02-0000-1000-8000-00805F9B34FB"

const WATER_TIMER_OP_CREATE = 0
const WATER_TIMER_OP_UPDATE = 1
const WATER_TIMER_OP_DELETE = 2

const SERVICE_UUID_SYSTEM_TIME = "000000FF-0000-1000-8000-00805F9B34FB"
const CHAR_UUID_SYSTEM_TIME = "0000FF01-0000-1000-8000-00805F9B34FB"

const SECS_PER_MINUTE: number = 60
const SECS_PER_HOUR: number = 60 * SECS_PER_MINUTE
const SECS_PER_DAY: number = 24 * SECS_PER_HOUR
const SECS_PER_WEEK: number = 7 * SECS_PER_DAY

const WDAYS_ALL = 0x7F

const DEFAULT_WATERING_STATUS: WateringStatus = {timerNo: 0, isWatering: false, minutesLeft: 0, secondsLeft: 0}

interface WaterTimer {
  timerNo: number,
  wdays: number,
  firstStartTimestampSec: number,
  volumeML: number
  durationSec: number
}

interface FormattedWaterTimer {
  timerNo: number,
  wdays: Array<boolean>,
  startTime: string,
  volumeML: number,
  duration: string
}

interface NextWaterTime {
  hoursLeft: number,
  minutesLeft: number,
  secondsLeft: number,
  volumeML: number,
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
    volumeMLForNewTimer: 30 as number,
    // timers: [] as Array<FormattedWaterTimer>
    nextWaterTime: {} as NextWaterTime,
    wateringStatus: DEFAULT_WATERING_STATUS as WateringStatus,
    timers: [{timerNo: 2, startTime: "6 时 12 分", volumeML: 100, duration: "3 分 12 秒"}] as Array<FormattedWaterTimer>,
  },

  deviceId: "",
  timers: [] as Array<WaterTimer>,
  formattedTimers: [] as Array<FormattedWaterTimer>,
  refreshPageTimerNo: undefined as number | undefined,
  stoppedTimers: new Map<number, number>() as Map<number, number>,  // timerNo -> restoreTimestampSecs

  async onLoad() {
    if (app.globalData.connectedDevice === undefined) {
      await wx.showModal({
        title: "(ó﹏ò｡)好像没有连到设备哟!",
        confirmText: "嗯嗯",
        showCancel: false
      })
      return
    }
    this.deviceId = app.globalData.connectedDevice.deviceId

    var minutes = []
    var secs = []
    for (let i = 0; i <= 60; i++) {
      minutes.push(i + "分")
      secs.push(i + "秒")
    }
    this.setData({pickerMinutesSecsArray: [minutes, secs]})

    wx.showToast({ icon: 'loading', title: '', mask: true, duration: 10000 })
    this.timers = await listWaterTimers(this.deviceId)
    adjSystemTime(this.deviceId)
    this.refreshPage()
    wx.hideToast()
  },

  refreshPage() {
    if (this.timers.length === 0) {
      this.setData({timers: [], wateringStatus: DEFAULT_WATERING_STATUS})
      return
    }

    console.log("[YL DEBUG] time")

    this.stoppedTimers = refreshStoppedTimers(this.stoppedTimers)
    this.timers = sortWaterTimers(this.timers, this.stoppedTimers)
    this.formattedTimers = formatWaterTimers(this.timers)
    var nextTimer = this.timers[0]
    this.setData({
      nextWaterTime: calcNextWaterTime(nextTimer),
      wateringStatus: getWateringStatus(nextTimer, this.stoppedTimers.has(nextTimer.timerNo)),
      timers: this.formattedTimers
    })
  },

  btnStopTimer() {
    var wateringStatus = this.data.wateringStatus
    if (!wateringStatus.isWatering ||
        (wateringStatus.minutesLeft === 0 && wateringStatus.secondsLeft === 0)) {
      return
    }

    var timerNo = wateringStatus.timerNo
    var timer: WaterTimer
    var found: boolean = false
    for (let t of this.timers) {
      if (t.timerNo === timerNo) {
        timer = t
        found = true
      }
    }
    if (!found) return

    wx.showToast({ icon: 'loading', title: '', mask: true, duration: 10000 })
    stopWater(this.deviceId).then(() => {
      wx.showToast({ icon: 'error', title: "停止成功", duration: 1000 })
      this.stoppedTimers.set(timerNo, Date.now() / 1000 + calcSecsToStop(timer))
      this.refreshPage()
    }).catch((e) => {
      console.log("Failed to stop water, ", e)
      wx.showToast({ icon: 'error', title: "停止失败", duration: 1000 })
    })
  },

  async btnDeleteTimer(event: WechatMiniprogram.BaseEvent) {
    var itemIndex = event.currentTarget.dataset.itemIndex
    var timer = this.formattedTimers[itemIndex]
    var res = await wx.showModal({
      title: "是否删除定时器？",
      content: "开始时间: " + timer.startTime + "\n 浇水量: " + timer.volumeML + "ml",
      confirmText: "是",
      cancelText: "否",
      showCancel: true,
    })

    if (!res.confirm) { return }

    wx.showToast({ icon: 'loading', title: '', mask: true, duration: 10000 })
    try {
      await deleteWaterTimer(this.deviceId, timer.timerNo)
      this.timers = await listWaterTimers(this.deviceId)
      wx.showToast({ icon: 'error', title: "删除成功", duration: 1000 })
      this.refreshPage()
    } catch (e) {
      console.log("Failed to delete timer, timer no: " + timer.timerNo, ", ", e)
      wx.showToast({ icon: 'error', title: "删除失败", duration: 1000 })
    }
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

  bindInputVolumeForNewTimer(e: WechatMiniprogram.CustomEvent) {
    this.setData({ volumeMLForNewTimer: e.detail.value })
  },

  async btnDoAddTimer() {
    var startTimestampSec = Date.parse("2022 1 1 " + this.data.pickAddStartTime + ":00") / 1000
    var timer: WaterTimer = {
      timerNo: 0,
      wdays: WDAYS_ALL,
      firstStartTimestampSec: startTimestampSec,
      volumeML: this.data.volumeMLForNewTimer,
      durationSec: 1
    }

    wx.showToast({ icon: 'loading', title: '', mask: true, duration: 10000 })
    try {
      await createWaterTimer(this.deviceId, timer)
      this.timers = await listWaterTimers(this.deviceId)
      console.log("Add timer succeed, timers now: ", this.timers);
      wx.showToast({icon: 'success', title: "添加成功", duration: 1000})
      this.setData({isShowAddTimerContainer: false})
      saveDefaultAddStartTime(this.data.pickAddStartTime)
      saveDefaultAddDuration(this.data.pickerAddDurationIndex)
      this.refreshPage()
    } catch (e) {
      wx.showToast({ icon: 'error', title: "添加失败", duration: 1000 })
      console.log('failed to add tiemr: write char value error, ', e)
    }
  },

  onPickAddStartTimeChange(e: WechatMiniprogram.CustomEvent) {
    this.setData({pickAddStartTime: e.detail.value})
  },

  onPickAddDurationChange(e: WechatMiniprogram.CustomEvent) {
    this.setData({pickerAddDurationIndex: e.detail.value})
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

function sortWaterTimers(timers: Array<WaterTimer>, stoppedTimers: Map<number, number>): Array<WaterTimer> {
  var calcWeight = (timer: WaterTimer): number => {
    var weight: number = 0
    if (stoppedTimers.has(timer.timerNo)) {
      weight = Number.MAX_VALUE
    } else if (isWatering(timer)) {
      weight = 0
    } else {
      weight = calcSecsToStart(timer)
    }
    return weight
  }

  var sortedTimers = timers.sort((a, b): number => {
    return calcWeight(a) - calcWeight(b)
  })

  return sortedTimers
}

function calcNextWaterTime(timer: WaterTimer): NextWaterTime {
  var secsToStart: number = calcSecsToStart(timer)

  var nextWaterTime: NextWaterTime = {
    hoursLeft: Math.floor((secsToStart % SECS_PER_DAY) / SECS_PER_HOUR),
    minutesLeft: Math.floor((secsToStart % SECS_PER_HOUR) / SECS_PER_MINUTE),
    secondsLeft: Math.floor(secsToStart % SECS_PER_MINUTE),
    volumeML: timer.volumeML,
    durationMinutes: Math.floor((timer.durationSec % SECS_PER_HOUR) / SECS_PER_MINUTE),
    durationSeconds: Math.floor(timer.durationSec % SECS_PER_MINUTE)
  }

  return nextWaterTime
}

function getWateringStatus(timer: WaterTimer, isStopped: boolean): WateringStatus {
  var secsToStop = calcSecsToStop(timer)

  var wateringStatus: WateringStatus = {
    timerNo: timer.timerNo,
    isWatering: !isStopped && secsToStop !== 0,
    minutesLeft: Math.floor((secsToStop % SECS_PER_HOUR) / SECS_PER_MINUTE),
    secondsLeft: Math.floor(secsToStop % SECS_PER_MINUTE)
  }

  return wateringStatus
}

function nextWday(wdays: number, wdayNow: number): number {
  if (wdays === 0) return 0xFF

  var n = wdayNow
  for (; n < 7; n++) {
    if (((wdays >> n) & 1) === 1) return n
  }

  n = 0
  for (; n < wdayNow; n++) {
    if (((wdays >> n) & 1) === 1) return n
  }

  return n
}

function calcSecsToStart(timer: WaterTimer): number {
  var nowTimestampSec = Date.now() / 1000

  // wdays === 0 means the timer is oneshot
  if (timer.wdays === 0) {
    if (nowTimestampSec > timer.firstStartTimestampSec) { return Number.MAX_VALUE }
    return timer.firstStartTimestampSec - nowTimestampSec
  }

  var nowWday = (new Date()).getDay()
  var startSecsInDay = timer.firstStartTimestampSec % SECS_PER_DAY
  var nowSecsInDay = nowTimestampSec % SECS_PER_DAY
  var startWday: number
  if (nowSecsInDay >= startSecsInDay) {
    startWday = nextWday(timer.wdays, (nowWday + 1) % 7)
  } else {
    startWday = nextWday(timer.wdays, nowWday)
  }
  var secsToStart = (startWday * SECS_PER_DAY + startSecsInDay) - (nowWday * SECS_PER_DAY + nowSecsInDay)
  if (secsToStart < 0) { secsToStart += SECS_PER_WEEK }

  return secsToStart
}

function calcSecsToStop(timer: WaterTimer): number {
  var nowTimestampSec = Date.now() / 1000
  if (nowTimestampSec < timer.firstStartTimestampSec) {
    return 0
  }

  var secsGone = (nowTimestampSec % SECS_PER_DAY) - (timer.firstStartTimestampSec % SECS_PER_DAY)
  secsGone += (secsGone < 0? SECS_PER_DAY : 0)
  var startTimestampSec = nowTimestampSec - secsGone
  var wday = (new Date(startTimestampSec * 1000)).getDay()

  if (secsGone < timer.durationSec &&
      (timer.wdays === 0 || ((timer.wdays >> wday) & 1) === 1)) {
    return timer.durationSec - secsGone
  }

  return 0
}

function isWatering(timer: WaterTimer): boolean {
  return calcSecsToStop(timer) > 0
}

function refreshStoppedTimers(stoppedTimers: Map<number, number>): Map<number, number> {
  var nowTimestamp = Date.now() / 1000
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

function formatTimestamp(timestampSec: number): string {
  var date = new Date(timestampSec * 1000)
  var hours = date.getHours();
  var minutes = date.getMinutes();
  return hours + " 时 " + minutes + " 分 "
}

function formatDuration(durationSec: number): string {
  return (durationSec >= 60? Math.floor(durationSec / 60) + " 分 " : "") + durationSec % 60 + " 秒"
}

function formatWdays(wdaysRaw: number): Array<boolean> {
  var wdays: Array<boolean> = []
  for (let i = 0; i < 7; i++) {
    if (((wdaysRaw >> i) & 1) !== 0) {
      wdays.push(true)
    } else {
      wdays.push(false)
    }
  }

  return wdays
}

function formatWaterTimer(timer: WaterTimer): FormattedWaterTimer {
  var formattedTimer: FormattedWaterTimer = {
    timerNo: timer.timerNo,
    wdays: formatWdays(timer.wdays),
    startTime: formatTimestamp(timer.firstStartTimestampSec),
    volumeML: timer.volumeML,
    duration: formatDuration(timer.durationSec)
  }

  return formattedTimer
}

function formatWaterTimers(timers: Array<WaterTimer>): Array<FormattedWaterTimer> {
  var formattedTimers: Array<FormattedWaterTimer> = []
  timers.forEach((timer) => {
    formattedTimers.push(formatWaterTimer(timer))
  })
  return formattedTimers
}

async function listWaterTimers(deviceId: string): Promise<Array<WaterTimer>> {
  var promise = new Promise<Array<WaterTimer>>((resolve, reject) => {
    app.listenCharValueChangeOnce(CHAR_UUID_WATER_TIMER).then((res) => {
      /*|-num_timers(1)-|-timer_no(1)-|-wdays(1)-|-timestamp(8)-|-ml(4)-|-duration(4)-|*/
      var timers: Array<WaterTimer> = []
      var buffer = Buffer.from(res.value)
      var numTimers = buffer.readUInt8(0)

      var offset = 1
      for (var i = 0; i < numTimers; i++) {
        var timer: WaterTimer = {
          timerNo: buffer.readUInt8(offset),
          wdays: buffer.readUInt8(offset + 1),
          firstStartTimestampSec: Number(buffer.readBigUInt64LE(offset + 2)),
          volumeML: buffer.readUInt32LE(offset + 10),
          durationSec: buffer.readUInt32LE(offset + 14)
        }
        offset += 18
        timers.push(timer)
      }

      resolve(timers)
    }).catch((e) => {
      console.log("Failed to list water timers!", e)
      reject(e)
    })

  })

  wx.readBLECharacteristicValue({
    deviceId: deviceId,
    serviceId: SERVICE_UUID_WATER_TIMER,
    characteristicId: CHAR_UUID_WATER_TIMER
  })
  
  return promise
}

async function createWaterTimer(deivceId: string, timer: WaterTimer): Promise<void> {
  /*|-op(1)-|-timer_no(1)-|-wdays(1)-|-timestamp(8)-|-ml(4)-|*/
  var buffer = Buffer.alloc(15)
  buffer.writeUInt8(WATER_TIMER_OP_CREATE, 0)
  buffer.writeUInt8(0, 1)
  buffer.writeUInt8(timer.wdays, 2)
  buffer.writeUIntLE(timer.firstStartTimestampSec, 3, 6)
  buffer.writeUInt32LE(timer.volumeML, 11)

  await wx.writeBLECharacteristicValue({
    deviceId: deivceId,
    serviceId: SERVICE_UUID_WATER_TIMER,
    characteristicId: CHAR_UUID_WATER_TIMER,
    value: buffer.buffer
  })
}

async function updateWaterTimer(deivceId: string, timer: WaterTimer): Promise<void> {
  /*|-op(1)-|-timer_no(1)-|-wdays(1)-|-timestamp(8)-|-ml(4)-|*/
  var buffer = Buffer.alloc(15)
  buffer.writeUInt8(WATER_TIMER_OP_UPDATE, 0)
  buffer.writeUInt8(timer.timerNo, 1)
  buffer.writeUInt8(timer.wdays, 2)
  buffer.writeUIntLE(timer.firstStartTimestampSec, 3, 6)
  buffer.writeUInt32LE(timer.volumeML, 11)

  await wx.writeBLECharacteristicValue({
    deviceId: deivceId,
    serviceId: SERVICE_UUID_WATER_TIMER,
    characteristicId: CHAR_UUID_WATER_TIMER,
    value: buffer.buffer
  })
}
 
async function deleteWaterTimer(deivceId: string, timerNo: number): Promise<void> {
  var buffer = Buffer.alloc(2)
  buffer.writeUInt8(WATER_TIMER_OP_DELETE, 0)
  buffer.writeUInt8(timerNo, 1)

  await wx.writeBLECharacteristicValue({
    deviceId: deivceId,
    serviceId: SERVICE_UUID_WATER_TIMER,
    characteristicId: CHAR_UUID_WATER_TIMER,
    value: buffer.buffer
  })
}

async function adjSystemTime(deviceId: string): Promise<void> {
  var timestampMs: number = Date.now()
  var buffer = Buffer.alloc(8)
  buffer.writeUIntLE(timestampMs/1000, 0, 6)

  wx.writeBLECharacteristicValue({
    deviceId: deviceId,
    serviceId: SERVICE_UUID_SYSTEM_TIME,
    characteristicId: CHAR_UUID_SYSTEM_TIME,
    value: buffer.buffer,
  })
}

async function stopWater(deviceId: string): Promise<void> {
  var buffer = Buffer.alloc(1)
  buffer.writeUInt8(1, 0)

  wx.writeBLECharacteristicValue({
    deviceId: deviceId,
    serviceId: SERVICE_UUID_WATER_TIMER,
    characteristicId: CHAR_UUID_WATER_CONTROL,
    value: buffer.buffer,
  })
}