import { convertFileSrc } from '@tauri-apps/api/core';
import { readPeopleBoxes } from '../../lib/forge';
import type { MediaItem } from '../../lib/media';
import { readPref, writePref } from '../../lib/preferences';
import { pictureLabels, type FramePeople, type RefMod, type VideoRef } from './ReferencesPanel';

type ImageReference={item:MediaItem;strength:number};
type VideoMode='t2v'|'i2v'|'v2v'|'ref2v';
export type H3ReferenceDraft=
 | {kind:'image';source:MediaItem|null;refs:ImageReference[]}
 | {kind:'video';mode:VideoMode;source:MediaItem|null;last:MediaItem|null;sourceVideo:MediaItem|null;lastOnly:boolean;
    refs:VideoRef[];mods:RefMod[];firstPeople?:FramePeople;lastPeople?:FramePeople};

const preference='studio.h3ReferenceDrafts.v1';
const maxDrafts=16;
const bounded=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length<=max;
const number=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const array=(value:unknown,max:number):unknown[]=>Array.isArray(value)?value.slice(0,max):[];

function localItem(value:unknown, allowed:readonly string[]=['image','video','audio'], restore=false):MediaItem|null {
 const {media,path,name}=object(value);
 if(!bounded(path,32768)||!path||/[\x00-\x1f]/.test(path)||! /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path)
    ||typeof media!=='string'||!allowed.includes(media))return null;
 return {path,media:media as MediaItem['media'],name:bounded(name,1024)&&name?name:path.split(/[\\/]/).at(-1)??path,src:restore?convertFileSrc(path):''};
}

function people(value:unknown):FramePeople|undefined {
 if(!value||typeof value!=='object')return undefined;
 const {who,whoAxis,boxes}=object(value);
 return {
  who:Array.isArray(who)&&who.length<=32&&who.every(n=>Number.isInteger(n)&&n>=1&&n<=32)?who:undefined,
  whoAxis:whoAxis==='y'||whoAxis==='z'||whoAxis==='none'?whoAxis:undefined,
  boxes:readPeopleBoxes(boxes)??undefined,
 };
}

function decode(value:unknown,restore:boolean):H3ReferenceDraft|null {
 const record=object(value);
 if(record.kind==='image'){
  const source=localItem(record.source,['image'],restore);
  const refs=array(record.refs,16).flatMap(raw=>{
   const ref=object(raw),item=localItem(ref.item,['image'],restore);
   return item&&number(ref.strength)&&ref.strength<=4?[{item,strength:ref.strength}]:[];
  });
  return {kind:'image',source,refs};
 }
 if(record.kind!=='video')return null;
 const source=localItem(record.source,['image','video'],restore);
 const last=localItem(record.last,['image'],restore);
 const sourceVideo=localItem(record.sourceVideo,['video'],restore);
 const refs=array(record.refs,12).flatMap<VideoRef>(raw=>{
  const ref=object(raw),item=localItem(ref.item,undefined,restore);
  const {second,strength,mediaMode,trimStart,trimEnd,sourceDuration,label,instructions,keep,drop,description}=ref;
  if(!item||!number(second)||!number(strength)||strength>4||(mediaMode!=='video'&&mediaMode!=='audio'&&mediaMode!=='video_audio'))return [];
  return [{item,second,strength,mediaMode,...people(ref),
   trimStart:number(trimStart)?trimStart:undefined,trimEnd:number(trimEnd)?trimEnd:undefined,sourceDuration:number(sourceDuration)?sourceDuration:undefined,
   label:typeof label==='string'&&pictureLabels.includes(label)?label:undefined,
   instructions:bounded(instructions,8192)?instructions:undefined,keep:bounded(keep,8192)?keep:undefined,
   drop:bounded(drop,8192)?drop:undefined,description:bounded(description,8192)?description:undefined}];
 });
 const mods=array(record.mods,8).flatMap(raw=>{
  const {name,strength,description,kinds}=object(raw);
  return bounded(name,2048)&&!!name&&number(strength)&&strength<=4?[{name,strength,description:bounded(description,8192)?description:'',
   kinds:Array.isArray(kinds)?kinds.filter((kind):kind is string=>bounded(kind,32)).slice(0,8):undefined}]:[];
 });
 const mode=record.mode==='i2v'||record.mode==='v2v'||record.mode==='ref2v'?record.mode:'t2v';
 return {kind:'video',mode,source,last,sourceVideo,lastOnly:record.lastOnly===true&&!!source&&source.path===last?.path,
  refs,mods,firstPeople:people(record.firstPeople),lastPeople:people(record.lastPeople)};
}

type Entry={key:string;draft:unknown};
const entries=()=>readPref<Entry[]>(preference,[],(value):value is Entry[]=>
 Array.isArray(value)&&value.length<=maxDrafts&&value.every(entry=>bounded(object(entry).key,32768)));

export function restoreH3ReferenceDraft(key:string){
 return decode(entries().find(entry=>entry.key===key)?.draft,true);
}

export function rememberH3ReferenceDraft(key:string,draft:H3ReferenceDraft){
 const saved=decode(draft,false);
 if(!saved||!bounded(key,32768))return;
 writePref(preference,[{key,draft:saved},...entries().filter(entry=>entry.key!==key)].slice(0,maxDrafts));
}
