import { addMinutes, minutesBetween } from '@sprout/schema/time'
import type { TaskRow } from '../data/types'
/** 놓을 곳: grid = 주·일 시간 칸(15분), allday = 주·일 종일 영역, day = 월 칸·타임라인 날 칸, timeline = 타임라인 일 배율(가로 시각) */
export interface CalendarDrop { day:string;minute?:number;zone?:'grid'|'allday'|'day'|'timeline' }
/** 실제 보이는 칸에서 계산한다. 접힌 00–07시 구간은 40px로 압축되어 있다. */
export function calendarDropAt(x:number,y:number):CalendarDrop|null {
 const el=document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-cal-day]')
 if(!el?.dataset.calDay)return null
 // 31 §2.5 타임라인 일 배율: 가로로 놓인 하루 칸(data-minute-width = 1분 폭 px) — 놓은 시각부터 1시간
 if(el.dataset.minuteWidth){const m=(x-el.getBoundingClientRect().left)/Number(el.dataset.minuteWidth);return {day:el.dataset.calDay,minute:Math.max(0,Math.min(1425,Math.floor(m/15)*15)),zone:'timeline'}}
 if(!el.dataset.hourHeight)return {day:el.dataset.calDay,zone:el.classList.contains('tg__allday-col')?'allday':'day'}
 const offset=y-el.getBoundingClientRect().top
 const h=Number(el.dataset.hourHeight)
 const raw=el.dataset.collapsed==='true'?(offset<=40?offset/40*420:420+(offset-40)*60/h):offset*60/h
 return {day:el.dataset.calDay,minute:Math.max(0,Math.min(1425,Math.floor(raw/15)*15)),zone:'grid'}
}
/** 날짜·시각 주기. 이미 시각 범위가 있으면 길이를 지킨다.
 * 캘린더 시간 칸에 놓으면 그 시각 한 점(틱틱 실측: 할일 정렬·종일에서 끌어 놓으면 한 줄 막대, 길이는 가장자리로 늘린다 — 06 §9),
 * 타임라인 일 배율은 막대가 보여야 하므로 1시간(31 §2.5). */
export function scheduledDrop(t:Pick<TaskRow,'id'|'start_at'|'due_at'>,target:CalendarDrop){
 if(target.minute===undefined)return {id:t.id,start_at:null,due_at:target.day}
 const start=`${target.day}T${String(Math.floor(target.minute/60)).padStart(2,'0')}:${String(target.minute%60).padStart(2,'0')}`
 if(t.start_at?.includes('T')&&t.due_at?.includes('T'))return {id:t.id,start_at:start,due_at:addMinutes(start,Math.max(15,minutesBetween(t.start_at,t.due_at)))}
 if(target.zone==='timeline')return {id:t.id,start_at:start,due_at:addMinutes(start,60)}
 return {id:t.id,start_at:null,due_at:start}
}

/** 캘린더 밖(할일 정렬 칸)에서 끌고 있는 할 일 — 캘린더 보기가 놓을 자리 미리 보기를 그린다(06 §9) */
export interface OutsideDrag { task:TaskRow;target:CalendarDrop|null }
let outside:OutsideDrag|undefined
const subs=new Set<()=>void>()
export const outsideDrag={
 get:()=>outside,
 set(v:OutsideDrag|undefined){outside=v;subs.forEach(f=>f())},
 subscribe(f:()=>void){subs.add(f);return()=>{subs.delete(f)}}
}
