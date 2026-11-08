/** clean-1149 #6: whole app uses Asia/Shanghai explicitly (box clock may be Tokyo); label always 「北京时间」. */
export const CANVAS_TIME_ZONE = 'Asia/Shanghai';
export const CANVAS_TIME_ZONE_LABEL = '北京时间';
/** clean-1651: clock-only 「HH:MM:SS」 in Asia/Shanghai for prior-run node badges. */
export function formatBeijingHms(iso:string,timeZone:string=CANVAS_TIME_ZONE):string {
  const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';
  const tz=timeZone || CANVAS_TIME_ZONE;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}
