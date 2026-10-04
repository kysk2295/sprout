import { addMinutes, minutesBetween } from '@sprout/schema/time'
import type { TaskRow } from '../data/types'
export interface CalendarDrop { day:string;minute?:number }
/** 실제 보이는 칸에서 계산한다. 접힌 00–07시 구간은 40px로 압축되어 있다. */
export function calendarDropAt(x:number,y:number):CalendarDrop|null {
 const el=document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-cal-day]')
 if(!el?.dataset.calDay)return null
 // 31 §2.5 타임라인 일 배율: 가로로 놓인 하루 칸(data-minute-width = 1분 폭 px) — 놓은 시각부터 1시간
 if(el.dataset.minuteWidth){const m=(x-el.getBoundingClientRect().left)/Number(el.dataset.minuteWidth);return {day:el.dataset.calDay,minute:Math.max(0,Math.min(1425,Math.floor(m/15)*15))}}
 if(!el.dataset.hourHeight)return {day:el.dataset.calDay}
 const offset=y-el.getBoundingClientRect().top
 const h=Number(el.dataset.hourHeight)
 const raw=el.dataset.collapsed==='true'?(offset<=40?offset/40*420:420+(offset-40)*60/h):offset*60/h
 return {day:el.dataset.calDay,minute:Math.max(0,Math.min(1425,Math.round(raw/15)*15))}
}
export function scheduledDrop(t:Pick<TaskRow,'id'|'start_at'|'due_at'>,target:CalendarDrop){
 if(target.minute===undefined)return {id:t.id,start_at:null,due_at:target.day}
 const start=`${target.day}T${String(Math.floor(target.minute/60)).padStart(2,'0')}:${String(target.minute%60).padStart(2,'0')}`
 const length=t.start_at?.includes('T')&&t.due_at?.includes('T')?Math.max(15,minutesBetween(t.start_at,t.due_at)):60
 return {id:t.id,start_at:start,due_at:addMinutes(start,length)}
}
