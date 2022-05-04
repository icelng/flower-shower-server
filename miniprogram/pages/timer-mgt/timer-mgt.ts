// pages/timer-mgt/timer-mgt.ts
const app = getApp<IAppOption>()
import { Buffer } from 'buffer';
import { Constants } from '../../app';

const DEFAULT_WATERING_STATUS: WateringStatus = {timerNo: 0, isWatering: false, minutesLeft: 0, secondsLeft: 0}

interface WaterTimer {
  timerNo: number,
  wdays: number,
  firstStartTimestampSec: number,
  volumeML: number
  durationSec: number
  stoppedUntil: number
}

interface FormattedWaterTimer {
  timerNo: number,
  wdays: string,
  startTime: string,
  volumeML: number,
  duration: string,
  isConflicted: boolean,
  stoppedUntil?: string
}

interface NextWaterTime {
  daysLeft: number,
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

interface WeekdayItem {
  name: string,
  value: number,
  checked: boolean
}

Page({
  data: {
    slideButtons: [{
        type: 'warn',
        text: '删除',
    }],
    pickerMinutesSecsArray: [] as Array<Array<string>>,
    checkboxItemsForNewTimer: [{value: 0x02, name: "一", checked: true},
                               {value: 0x04, name: "二", checked: true},
                               {value: 0x08, name: "三", checked: true},
                               {value: 0x10, name: "四", checked: true},
                               {value: 0x20, name: "五", checked: true},
                               {value: 0x40, name: "六", checked: true},
                               {value: 0x01, name: "日", checked: true},
                               {value: 0x80, name: "每天", checked: true}] as Array<WeekdayItem>,
    isShowAddTimerContainer: false,
    isUpdateTimer: false,
    updatingTimer: {} as FormattedWaterTimer,
    pickAddStartTime: "13:00",
    volumeMLForNewTimer: 30 as number,
    nextWaterTime: {} as NextWaterTime,
    wateringStatus: DEFAULT_WATERING_STATUS as WateringStatus,
    timers: [] as Array<FormattedWaterTimer>
  },

  isFirstShowPage: true,
  deviceId: "",
  timers: [] as Array<WaterTimer>,
  formattedTimers: [] as Array<FormattedWaterTimer>,
  refreshPageTimerNo: undefined as number | undefined,
  wdaysForNewTimer: 0xFF as number,

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
    this.setData({
      pickerMinutesSecsArray: [minutes, secs],
      pickAddStartTime: loadDefaultAddStartTime(),
      volumeMLForNewTimer: loadDefaulVolume(),
    })

    wx.showToast({ icon: 'loading', title: '获取列表', mask: true, duration: 15000 })
    await adjSystemTime(this.deviceId)
    this.timers = await listWaterTimers(this.deviceId)
    wx.hideToast()
  },

  refreshPage() {
    // this.timers = [{
    //   timerNo: 2,
    //   firstStartTimestampSec: 1651420860,
    //   wdays: 0x02,
    //   volumeML: 120,
    //   durationSec: 300
    // },
    // {
    //   timerNo: 3,
    //   firstStartTimestampSec: 1651420680,
    //   wdays: 0x01,
    //   volumeML: 100,
    //   durationSec: 300
    // }] // for debug

    if (this.timers.length === 0) {
      this.setData({timers: [], wateringStatus: DEFAULT_WATERING_STATUS})
      return
    }

    this.timers = sortWaterTimers(this.timers)
    var conflictedTimers = findConflictedWaterTimers(this.timers)
    this.formattedTimers = formatWaterTimers(this.timers, conflictedTimers)
    var nextTimer = this.timers[0]
    this.setData({
      nextWaterTime: calcNextWaterTime(nextTimer),
      wateringStatus: getWateringStatus(nextTimer),
      timers: this.formattedTimers
    })
  },

  checkboxChangeForNewTimer(event: WechatMiniprogram.CustomEvent) {
    var newWdays: number = 0
    var lastWdays = this.wdaysForNewTimer
    var newCheckboxItems = this.data.checkboxItemsForNewTimer

    for (let value of event.detail.value) {
      newWdays |= Number(value)
    }

    if (((newWdays ^ lastWdays) & 0x80) !== 0) {
      if ((newWdays & 0x80) !== 0) {
        newWdays = 0xFF
      } else {
        newWdays = 0
      }
    } else {
      if ((newWdays & 0x7F) == 0x7F) {
        newWdays |= 0x80
      } else {
        newWdays &= 0x7F
      }
    }

    for (let item of newCheckboxItems) {
      item.checked = (item.value & newWdays) !== 0
    }

    this.wdaysForNewTimer = newWdays
    this.setData({checkboxItemsForNewTimer: newCheckboxItems})
  },

  async btnStopTimer() {
    var wateringStatus = this.data.wateringStatus
    if (!wateringStatus.isWatering ||
        (wateringStatus.minutesLeft === 0 && wateringStatus.secondsLeft === 0)) {
      return
    }

    var timerNo = wateringStatus.timerNo
    var found: boolean = false
    for (let t of this.timers) {
      if (t.timerNo === timerNo) {
        found = true
      }
    }
    if (!found) return

    wx.showToast({ icon: 'loading', title: '停止中', mask: true, duration: 10000 })
    try {
      await stopWaterTimer(this.deviceId, timerNo)
      this.timers = await listWaterTimers(this.deviceId)
      this.refreshPage()
      wx.showToast({ icon: 'success', title: "停止成功", duration: 1000 })
    } catch (e) {
      console.log("Failed to stop water, ", e)
      wx.showToast({ icon: 'error', title: "停止失败", duration: 1000 })
    }
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
      wx.showToast({ icon: 'success', title: "删除成功", duration: 1000 })
      this.refreshPage()
    } catch (e) {
      console.log("Failed to delete timer, timer no: " + timer.timerNo, ", ", e)
      wx.showToast({ icon: 'error', title: "删除失败", duration: 1000 })
    }
  },

  btnCancelAddTimer() {
    this.setData({isShowAddTimerContainer: false})
  },

  bindInputVolumeForNewTimer(e: WechatMiniprogram.CustomEvent) {
    this.setData({ volumeMLForNewTimer: e.detail.value })
  },

  btnShowAddTimer() {
    this.setData({
      isShowAddTimerContainer: true,
      isUpdateTimer: false,
      pickAddStartTime: loadDefaultAddStartTime(),
      volumeMLForNewTimer: loadDefaulVolume()
    })
  },

  btnShowUpdateTimerPage(event: WechatMiniprogram.BaseEvent) {
    var itemIndex = event.currentTarget.dataset.itemIndex
    var updatingTimer = this.data.timers[itemIndex]
    var rawTimer: WaterTimer | undefined = undefined
    for (let t of this.timers) {
      if (t.timerNo === updatingTimer.timerNo) {
        rawTimer = t
      }
    }

    var date = new Date(rawTimer!.firstStartTimestampSec * 1000)
    var newWdays = rawTimer!.wdays
    if ((newWdays & 0x7F) == 0x7F) {
      newWdays |= 0x80
    } else {
      newWdays &= 0x7F
    }
    var newCheckboxItems = this.data.checkboxItemsForNewTimer
    for (let item of newCheckboxItems) {
      item.checked = (item.value & newWdays) !== 0
    }
    this.wdaysForNewTimer = newWdays

    saveDefaultAddStartTime(this.data.pickAddStartTime)
    saveDefaultVolume(this.data.volumeMLForNewTimer)
    this.setData({
      pickAddStartTime: date.getHours() + ":" + date.getMinutes(),
      checkboxItemsForNewTimer: newCheckboxItems,
      volumeMLForNewTimer: rawTimer!.volumeML,
      updatingTimer: this.data.timers[itemIndex],
      isShowAddTimerContainer:true,
      isUpdateTimer: true
    })
  },

  async btnAddTimer() {
    console.log("Volume now is: " +this.data.volumeMLForNewTimer)
    if (this.data.volumeMLForNewTimer == 0 || Number.isNaN(this.data.volumeMLForNewTimer)) {
      await wx.showModal({
        title: "╮(─▽─)╭浇水量不能为空哟!",
        confirmText: "嗯嗯",
        showCancel: false
      })
      return
    }

    if (this.wdaysForNewTimer === 0) {
      await wx.showModal({
        title: "～(´ー｀～) 请至少选择一天!",
        confirmText: "嗯嗯",
        showCancel: false
      })
      return
    }

    var startTimestampSec = Date.parse("2022 1 1 " + this.data.pickAddStartTime + ":00") / 1000
    var timer: WaterTimer = {
      timerNo: this.data.isUpdateTimer? this.data.updatingTimer.timerNo : 0,
      wdays: this.wdaysForNewTimer & 0x7F,
      firstStartTimestampSec: startTimestampSec,
      volumeML: this.data.volumeMLForNewTimer,
      durationSec: 1,
      stoppedUntil: 0
    }

    wx.showToast({ icon: 'loading', title: '', mask: true, duration: 10000 })
    try {
      if (this.data.isUpdateTimer) {
        await updateWaterTimer(this.deviceId, timer)
      } else {
        await createWaterTimer(this.deviceId, timer)
      }
      this.timers = await listWaterTimers(this.deviceId)
      console.log("Add timer succeed, timers now: ", this.timers);
      wx.showToast({icon: 'success', title: "添加成功", duration: 1000})
      this.setData({isShowAddTimerContainer: false})
      saveDefaultAddStartTime(this.data.pickAddStartTime)
      saveDefaultVolume(this.data.volumeMLForNewTimer)
      this.refreshPage()
    } catch (e) {
      wx.showToast({ icon: 'error', title: "添加失败", duration: 1000 })
      console.log('failed to add tiemr: write char value error, ', e)
    }
  },

  onPickAddStartTimeChange(e: WechatMiniprogram.CustomEvent) {
    this.setData({pickAddStartTime: e.detail.value})
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

    // skip list tiemrs in first time
    if (this.isFirstShowPage) {
      this.isFirstShowPage = false;
      return
    }

    // silent list
    listWaterTimers(this.deviceId).then((timers) => {
      this.timers = timers
      this.refreshPage()
    })
  }
})

function sortWaterTimers(timers: Array<WaterTimer>): Array<WaterTimer> {
  var now_secs = Date.now() / 1000
  var calcWeight = (timer: WaterTimer): number => {
    var weight: number = 0
    if (timer.stoppedUntil > now_secs) {
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
    daysLeft: Math.floor(secsToStart / Constants.SECS_PER_DAY),
    hoursLeft: Math.floor((secsToStart % Constants.SECS_PER_DAY) / Constants.SECS_PER_HOUR),
    minutesLeft: Math.floor((secsToStart % Constants.SECS_PER_HOUR) / Constants.SECS_PER_MINUTE),
    secondsLeft: Math.floor(secsToStart % Constants.SECS_PER_MINUTE),
    volumeML: timer.volumeML,
    durationMinutes: Math.floor((timer.durationSec % Constants.SECS_PER_HOUR) / Constants.SECS_PER_MINUTE),
    durationSeconds: Math.floor(timer.durationSec % Constants.SECS_PER_MINUTE)
  }

  return nextWaterTime
}

function getWateringStatus(timer: WaterTimer): WateringStatus {
  var secsToStop = calcSecsToStop(timer)
  var isStopped = timer.stoppedUntil > (Date.now() / 1000)

  var wateringStatus: WateringStatus = {
    timerNo: timer.timerNo,
    isWatering: !isStopped && secsToStop !== 0,
    minutesLeft: Math.floor((secsToStop % Constants.SECS_PER_HOUR) / Constants.SECS_PER_MINUTE),
    secondsLeft: Math.floor(secsToStop % Constants.SECS_PER_MINUTE)
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
  var startSecsInDay = timer.firstStartTimestampSec % Constants.SECS_PER_DAY
  var nowSecsInDay = nowTimestampSec % Constants.SECS_PER_DAY
  var startWday: number
  if (nowSecsInDay >= startSecsInDay) {
    startWday = nextWday(timer.wdays, (nowWday + 1) % 7)
  } else {
    startWday = nextWday(timer.wdays, nowWday)
  }
  var secsToStart = (startWday * Constants.SECS_PER_DAY + startSecsInDay) - (nowWday * Constants.SECS_PER_DAY + nowSecsInDay)
  if (secsToStart < 0) { secsToStart += Constants.SECS_PER_WEEK }

  return secsToStart
}

function calcSecsToStop(timer: WaterTimer): number {
  var nowTimestampSec = Date.now() / 1000
  if (nowTimestampSec < timer.firstStartTimestampSec) {
    return 0
  }

  var secsGone = (nowTimestampSec % Constants.SECS_PER_DAY) - (timer.firstStartTimestampSec % Constants.SECS_PER_DAY)
  secsGone += (secsGone < 0? Constants.SECS_PER_DAY : 0)
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

function findConflictedWaterTimers(timers: Array<WaterTimer>): Set<number> {
  if (timers.length <= 1) return new Set<number>()

  interface Range {
    timerNo: number,
    startTimeInDay: number,
    endTimeInDay: number
  }

  var ranges = new Array<Range>()
  for (let timer of timers) {
    for (let i = 0; i < 7; i++) {
      if (((timer.wdays >> i) & 1) !== 0) {
        var startTimeInDay = i * Constants.SECS_PER_DAY +
                             (timer.firstStartTimestampSec + Constants.UTC_OFFSET_SECS) % Constants.SECS_PER_DAY
        var endTimeInDay = startTimeInDay + timer.durationSec
        var range: Range = {
          timerNo: timer.timerNo,
          startTimeInDay: startTimeInDay,
          endTimeInDay: endTimeInDay
        }
        ranges.push(range)
      }
    }
  }
  ranges = ranges.sort((a, b) => {
    return a.startTimeInDay - b.startTimeInDay
  })

  var conflictedTimerNos = new Set<number>()
  var numRanges = ranges.length
  for (let i = 0; i < numRanges; i++) {
    var curRange = ranges[i]
    var nextRange = ranges[(i + 1) % numRanges]
    var nextStartTimeInDay = nextRange.startTimeInDay + ((i + 1) == numRanges? Constants.SECS_PER_WEEK : 0)
    if (curRange.endTimeInDay > nextStartTimeInDay) {
      conflictedTimerNos.add(curRange.timerNo)
      conflictedTimerNos.add(nextRange.timerNo)
    }
  }

  return conflictedTimerNos
}

function saveDefaultAddStartTime(time: string): void {
  wx.setStorageSync<string>("df-add-start-time", time)
}

function loadDefaultAddStartTime(): string {
  try{
    var time = wx.getStorageSync<string>("df-add-start-time")
    if (time) return time
    else return "22:56"
  } catch {
    return "22:56"
  }
}

function saveDefaultVolume(volumeML: number): void {
  wx.setStorageSync<number>("df-volume", volumeML)
}
 
function loadDefaulVolume(): number {
  try {
    var value: number = wx.getStorageSync<number>("df-volume")
    if (value) return value
    else return 27
  } catch {
    return 27
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

function formatWdays(wdaysRaw: number): string {
  if (wdaysRaw == 0x7F) return "每天"

  var translate = ["日", "一", "二", "三", "四", "五", "六"]
  var str: string = "星期"
  for (let i = 0; i < 7; i++) {
    var j = (i + 1) % 7
    if (((wdaysRaw >> j) & 1) === 1) {
      str = str + " " + translate[j]
    }
  }

  return str
}

function formatWaterTimers(timers: Array<WaterTimer>, conflictedTimerNos: Set<number>): Array<FormattedWaterTimer> {
  var formattedTimers: Array<FormattedWaterTimer> = []
  var now_secs = Date.now() / 1000
  timers.forEach((timer) => {
    var formattedTimer: FormattedWaterTimer = {
      timerNo: timer.timerNo,
      wdays: formatWdays(timer.wdays),
      startTime: formatTimestamp(timer.firstStartTimestampSec),
      volumeML: timer.volumeML,
      duration: formatDuration(timer.durationSec),
      isConflicted: conflictedTimerNos.has(timer.timerNo),
      stoppedUntil: now_secs < timer.stoppedUntil? formatTimeWithWday(timer.stoppedUntil * 1000) : undefined
    }
    formattedTimers.push(formattedTimer)
  })
  return formattedTimers
}

async function listWaterTimers(deviceId: string): Promise<Array<WaterTimer>> {
  var promise = new Promise<Array<WaterTimer>>((resolve, reject) => {
    app.listenCharValueChangeOnce(Constants.CHAR_UUID_WATER_TIMER).then((res) => {
      /*|-num_timers(1)-|-timer_no(1)-|-wdays(1)-|-timestamp(8)-|-ml(4)-|-duration(4)-|-stopped_until(8)-|*/
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
          durationSec: buffer.readUInt32LE(offset + 14),
          stoppedUntil: Number(buffer.readBigUInt64LE(offset + 18))
        }
        offset += 26
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
    serviceId: Constants.SERVICE_UUID_WATER_TIMER,
    characteristicId: Constants.CHAR_UUID_WATER_TIMER
  })
  
  return promise
}

async function createWaterTimer(deivceId: string, timer: WaterTimer): Promise<void> {
  /*|-op(1)-|-timer_no(1)-|-wdays(1)-|-timestamp(8)-|-ml(4)-|*/
  var buffer = Buffer.alloc(15)
  buffer.writeUInt8(Constants.WATER_TIMER_OP_CREATE, 0)
  buffer.writeUInt8(0, 1)
  buffer.writeUInt8(timer.wdays, 2)
  buffer.writeUIntLE(timer.firstStartTimestampSec, 3, 6)
  buffer.writeUInt32LE(timer.volumeML, 11)

  await wx.writeBLECharacteristicValue({
    deviceId: deivceId,
    serviceId: Constants.SERVICE_UUID_WATER_TIMER,
    characteristicId: Constants.CHAR_UUID_WATER_TIMER,
    value: buffer.buffer
  })
}

async function updateWaterTimer(deivceId: string, timer: WaterTimer): Promise<void> {
  /*|-op(1)-|-timer_no(1)-|-wdays(1)-|-timestamp(8)-|-ml(4)-|*/
  var buffer = Buffer.alloc(15)
  buffer.writeUInt8(Constants.WATER_TIMER_OP_UPDATE, 0)
  buffer.writeUInt8(timer.timerNo, 1)
  buffer.writeUInt8(timer.wdays, 2)
  buffer.writeUIntLE(timer.firstStartTimestampSec, 3, 6)
  buffer.writeUInt32LE(timer.volumeML, 11)

  await wx.writeBLECharacteristicValue({
    deviceId: deivceId,
    serviceId: Constants.SERVICE_UUID_WATER_TIMER,
    characteristicId: Constants.CHAR_UUID_WATER_TIMER,
    value: buffer.buffer
  })
}
 
async function deleteWaterTimer(deivceId: string, timerNo: number): Promise<void> {
  var buffer = Buffer.alloc(2)
  buffer.writeUInt8(Constants.WATER_TIMER_OP_DELETE, 0)
  buffer.writeUInt8(timerNo, 1)

  await wx.writeBLECharacteristicValue({
    deviceId: deivceId,
    serviceId: Constants.SERVICE_UUID_WATER_TIMER,
    characteristicId: Constants.CHAR_UUID_WATER_TIMER,
    value: buffer.buffer
  })
}

async function stopWaterTimer(deivceId: string, timerNo: number): Promise<void> {
  var buffer = Buffer.alloc(2)
  buffer.writeUInt8(Constants.WATER_TIMER_OP_STOP, 0)
  buffer.writeUInt8(timerNo, 1)

  await wx.writeBLECharacteristicValue({
    deviceId: deivceId,
    serviceId: Constants.SERVICE_UUID_WATER_TIMER,
    characteristicId: Constants.CHAR_UUID_WATER_TIMER,
    value: buffer.buffer
  })
}

function formatTimeWithWday(timestampMs: number): string {
  var date = new Date(timestampMs)
  var translate = ["日", "一", "二", "三", "四", "五", "六"]
  return `${date.getHours()} 时 ${date.getMinutes()} 分 星期 ${translate[date.getDay()]}`
}

async function adjSystemTime(deviceId: string): Promise<void> {
  var timestampMs: number = Date.now()
  var buffer = Buffer.alloc(8)
  buffer.writeUIntLE(timestampMs/1000, 0, 6)

  wx.writeBLECharacteristicValue({
    deviceId: deviceId,
    serviceId: Constants.SERVICE_UUID_SYSTEM_TIME,
    characteristicId: Constants.CHAR_UUID_SYSTEM_TIME,
    value: buffer.buffer,
  })
}