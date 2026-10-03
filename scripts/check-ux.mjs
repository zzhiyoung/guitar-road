/** Run with Node 24+: node --experimental-transform-types scripts/check-ux.mjs. Always uses synthetic temporary data. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as at from '@coderline/alphatab';
import Database from 'better-sqlite3';
at.Logger.logLevel=at.LogLevel.None;
const root=path.resolve(import.meta.dirname,'..');
registerHooks({resolve(specifier,context,next){
  if(specifier==='next/cache') return next('data:text/javascript,export function revalidatePath(){}',context);
  if(specifier.startsWith('@/')) {
    const base=path.join(root,'src',specifier.slice(2));
    return next(pathToFileURL(fs.existsSync(base+'.ts') ? base+'.ts' : path.join(base,'index.ts')).href,context);
  }
  if(specifier.startsWith('.')&&context.parentURL?.endsWith('.ts')) {
    const url=new URL(specifier,context.parentURL);
    for(const suffix of ['.ts','/index.ts']) if(fs.existsSync(fileURLToPath(url)+suffix)) return next(url.href+suffix,context);
  }
  return next(specifier,context);
}});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'guitar-road-ux-'));
process.env.GUITAR_DB_PATH=path.join(tmp,'regression.db');
process.env.GUITAR_FILES_DIR=path.join(tmp,'files');
const {barTimings,barRangeToTicks,withLinearPracticePlayback}=await import('../src/lib/alphatab/score-utils.ts');
const {readScoreSummary}=await import('../src/lib/alphatab/server-score.ts');
const xml=`<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>UX boundary fixture</work-title></work><identification><creator type="composer">Fixture Composer</creator></identification><part-list><score-part id="P1"><part-name>Guitar</part-name><score-instrument id="I1"><instrument-name>Guitar</instrument-name></score-instrument><midi-instrument id="I1"><midi-channel>1</midi-channel><midi-program>25</midi-program></midi-instrument></score-part></part-list><part id="P1">${Array.from({length:6},(_,i)=>`<measure number="${i+1}">${i===0?'<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="120"/></direction>':''}${i===3?'<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>':''}${i===1?'<barline location="left"><repeat direction="forward"/></barline>':''}${Array.from({length:i<3?4:3},()=>`<note><pitch><step>${['C','D','E','F','G','A'][i]}</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>`).join('')}${i===2?'<barline location="right"><repeat direction="backward" times="2"/></barline>':''}</measure>`).join('')}</part></score-partwise>`;
fs.writeFileSync(path.join(tmp,'fixture.musicxml'),xml);
const score=at.importer.ScoreLoader.loadScoreFromBytes(Buffer.from(xml));
assert.equal(readScoreSummary(Buffer.from(xml)).title,'UX boundary fixture');
assert.equal(readScoreSummary(Buffer.from(xml)).artist,'Fixture Composer');
assert.equal(readScoreSummary(Buffer.from(xml)).tempo,120);
assert.throws(()=>readScoreSummary(Buffer.from('invalid')));
const timings=barTimings(score),range=barRangeToTicks(timings,2,3);
assert.equal(range.startTick,timings[1].startTick);
assert.equal(range.endTick,timings[3].startTick);
assert.equal(barRangeToTicks(timings,4,4).endTick-barRangeToTicks(timings,4,4).startTick,2880);
assert.equal(barRangeToTicks(timings,6,6).endTick,timings[5].startTick+2880);
const makeMidi=(source=score)=>{
 const file=new at.midi.MidiFile();
 new at.midi.MidiFileGenerator(source,null,new at.midi.AlphaSynthMidiFileHandler(file)).generate();return file;
};
const normal=makeMidi();let linear;
const before=score.masterBars.map(b=>[b.repeatCount,b.alternateEndings,b.directions,b.repeatGroup.isClosed]);
withLinearPracticePlayback(score,()=>{linear=makeMidi();});
assert.deepEqual(score.masterBars.map(b=>[b.repeatCount,b.alternateEndings,b.directions,b.repeatGroup.isClosed]),before);
assert.throws(()=>withLinearPracticePlayback(score,()=>{throw new Error('restore');}));
assert.deepEqual(score.masterBars.map(b=>[b.repeatCount,b.alternateEndings,b.directions,b.repeatGroup.isClosed]),before);
const notes=file=>file.tracks.flatMap(t=>t.events).filter(e=>e instanceof at.midi.NoteOnEvent&&e.channel!==9&&e.noteVelocity>0);
assert.equal(notes(linear).length,21);assert.ok(notes(normal).length>notes(linear).length);
const pickupXml=xml.replace('<measure number="1">','<measure number="1" implicit="yes">').replace(/(<note><pitch><step>C<\/step>[\s\S]*?<\/note>){4}/, '<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>');
const pickup=at.importer.ScoreLoader.loadScoreFromBytes(Buffer.from(pickupXml));
const pickupTimings=barTimings(pickup);assert.equal(pickupTimings[0].durationTicks,960);assert.equal(pickupTimings[1].startTick,960);
let pickupMidi;withLinearPracticePlayback(pickup,()=>pickupMidi=makeMidi(pickup));assert.equal(notes(pickupMidi).find(e=>e.noteKey===62).tick,960);
// Exercise the actual synth's range, loops, count-in, cancellation and PCM output.
class Emitter { handlers=[]; on(h){this.handlers.push(h);} off(h){this.handlers=this.handlers.filter(x=>x!==h);} trigger(...a){for(const h of this.handlers)h(...a);} }
class Output {
 sampleRate=44100; ready=new Emitter();samplesPlayed=new Emitter();sampleRequest=new Emitter();chunks=[];playing=false;
 open(){this.ready.trigger();}play(){this.playing=true;}pause(){this.playing=false;}activate(){}destroy(){}resetSamples(){this.chunks=[];}
 addSamples(samples){this.chunks.push(samples);}
 pump(){this.sampleRequest.trigger();const samples=this.chunks.shift();if(samples?.length)this.samplesPlayed.trigger(samples.length/2);return samples;}
}
const soundfont=fs.readFileSync(path.join(root,'public/alphatab/soundfont/sonivox.sf2'));
function runSynth({loop=false,countIn=0,volume=1,pumps=1000,selected=range,speed=1}={}){
 const output=new Output(),synth=new at.synth.AlphaSynth(output,100);
 synth.loadSoundFont(soundfont,false);synth.loadMidiFile(linear);synth.masterVolume=volume;synth.playbackRange=selected;synth.isLooping=loop;synth.playbackSpeed=speed;synth.tickPosition=selected.startTick;synth.countInVolume=countIn;
 const played=[];let finished=0,peak=0,sum=0,length=0;
 synth.midiEventsPlayedFilter=[at.midi.MidiEventType.NoteOn];synth.midiEventsPlayed.on(e=>played.push(...e.events.filter(x=>x instanceof at.midi.NoteOnEvent&&x.channel!==9)));
 synth.finished.on(()=>finished++);synth.play();
 let steps=0;for(;steps<pumps&&output.playing;steps++){const samples=output.pump();for(const x of samples??[]){peak=Math.max(peak,Math.abs(x));sum+=x*x;length++;}}
 return {synth,output,played,finished,steps,peak,rms:Math.sqrt(sum/Math.max(1,length)),seconds:length/2/44100};
}
const single=runSynth();
assert.equal(single.finished,1);assert.equal(single.synth.state,0);
assert.ok(single.played.length>0);assert.ok(single.played.every(n=>n.tick>=range.startTick&&n.tick<range.endTick));
const repeated=runSynth({loop:true,pumps:650});assert.ok(repeated.finished>=2);assert.ok(repeated.played.every(n=>n.tick>=range.startTick&&n.tick<range.endTick));repeated.synth.stop();
const counted=runSynth({countIn:0.6});assert.ok(counted.seconds-single.seconds>1.8);
const cancelled=runSynth({countIn:0.6,pumps:10});cancelled.synth.stop();for(let i=0;i<100;i++)cancelled.output.pump();assert.equal(cancelled.finished,0);assert.equal(cancelled.played.length,0);
const louder=runSynth({volume:1.5});assert.ok(louder.rms>single.rms*1.4);assert.ok(louder.peak<1,'fixture at default gain clips');
// The application count-in must use the selected meter, quarter-note BPM and an audio clock.
const {CountIn}=await import('../src/lib/audio/count-in.ts');
let context, callback; const scheduled=[];
const nativeInterval=globalThis.setInterval,nativeClear=globalThis.clearInterval;
class FakeAudioContext {
 state='running';currentTime=0;destination={};
 constructor(){context=this;}
 createOscillator(){const node={frequency:{setValueAtTime(){}},connect(){},disconnect(){},start(time){scheduled.push(time);},stop(){node.stopped=true;}};return node;}
 createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
 close(){return Promise.resolve();}
}
globalThis.window={AudioContext:FakeAudioContext};globalThis.setInterval=fn=>{callback=fn;return 1;};globalThis.clearInterval=()=>{callback=null;};
const preRoll=new CountIn();let completions=0;
await preRoll.start({bpm:120,numerator:3,denominator:4,volume:0.6},()=>completions++);
assert.equal(scheduled.length,3);assert.deepEqual(scheduled,[0.06,0.56,1.06]);
context.currentTime=1.55;callback();assert.equal(completions,0);context.currentTime=1.57;callback();assert.equal(completions,1);
await preRoll.start({bpm:120,numerator:6,denominator:8,volume:0.6},()=>completions++);const cancelledCallback=callback;preRoll.cancel();context.currentTime=10;cancelledCallback();assert.equal(completions,1);
// Cancel while AudioContext.resume is still pending must also suppress the completion.
let resume;context.state='suspended';context.resume=()=>new Promise(resolve=>{resume=resolve;});
const pendingPreRoll=preRoll.start({bpm:60,numerator:4,denominator:4,volume:0.6},()=>completions++);preRoll.cancel();resume();await pendingPreRoll;assert.equal(completions,1);
preRoll.dispose();globalThis.setInterval=nativeInterval;globalThis.clearInterval=nativeClear;delete globalThis.window;
const {getDb}=await import('../src/lib/db/client.ts');const db=getDb(),sqlite=db.$client;
const {getCurrentUserId}=await import('../src/lib/repositories/users.ts');const userId=await getCurrentUserId();
const {createSong}=await import('../src/lib/repositories/songs.ts');const song=await createSong({userId,title:'Synthetic'});
const {scheduleWholeSong}=await import('../src/lib/repositories/whole-song.ts');
const input={userId,songId:song.id,barCount:6,tempo:120,date:'2026-10-02'};
const first=scheduleWholeSong(input),again=scheduleWholeSong(input);assert.equal(first.blockId,again.blockId);assert.equal(again.alreadyScheduled,true);
assert.equal(sqlite.prepare('select count(*) as n from practice_tasks').get().n,1);
sqlite.prepare('update practice_tasks set status=?').run('done');scheduleWholeSong({...input,barCount:8});assert.equal(sqlite.prepare('select status from practice_tasks').get().status,'done');
scheduleWholeSong({...input,date:'2026-10-03'});assert.equal(sqlite.prepare('select count(*) as n from practice_tasks').get().n,2);assert.equal(sqlite.prepare('select count(*) as n from practice_blocks').get().n,1);
// Actual upload action with isolated storage; only Next cache invalidation is stubbed.
const {uploadScoreFileAction}=await import('../src/app/actions/upload.ts');
const upload=async(content,fields={})=>{
 const form=new FormData();form.set('file',new File([content],'fixture.musicxml'));
 for(const [key,value] of Object.entries(fields))form.set(key,value);
 return uploadScoreFileAction({status:'idle'},form);
};
const imported=await upload(xml);assert.equal(imported.status,'ok');
const uploaded=sqlite.prepare("select * from songs where title='UX boundary fixture'").get();assert.ok(uploaded);assert.equal(uploaded.artist,'Fixture Composer');
const manual=await upload(xml,{title:'Manual title',artist:'Manual artist'});assert.equal(manual.status,'ok');assert.equal(sqlite.prepare("select artist from songs where title='Manual title'").get().artist,'Manual artist');
await upload(xml.replace('UX boundary fixture','New version'),{songId:uploaded.id,title:'Should not replace',artist:'Different'});
assert.equal(sqlite.prepare('select title from songs where id=?').get(uploaded.id).title,'UX boundary fixture');
assert.equal(sqlite.prepare('select count(*) as n from score_files where song_id=?').get(uploaded.id).n,2);
const beforeInvalid=sqlite.prepare('select count(*) as n from songs').get().n;
assert.equal((await upload('invalid')).status,'error');assert.equal(sqlite.prepare('select count(*) as n from songs').get().n,beforeInvalid);
// Migration on an old schema must preserve existing block and session rows, and be idempotent.
const old=new Database(':memory:');old.exec('create table users(id text primary key);create table songs(id text primary key);create table practice_blocks(id text primary key,user_id text,song_id text,name text);create table practice_sessions(id text primary key,duration_min integer);insert into practice_blocks values("old","u","s","keep");insert into practice_sessions values("session",17);'.replaceAll('"',"'"));
const {runMigrations}=await import('../src/lib/db/migrations.ts');runMigrations({$client:old});runMigrations({$client:old});assert.deepEqual(old.prepare('select * from practice_blocks').get(),{id:'old',user_id:'u',song_id:'s',name:'keep',is_whole_song:0});assert.equal(old.prepare('select duration_min from practice_sessions').get().duration_min,17);
const {latestScoreFirst}=await import('../src/lib/repositories/score-files.ts');assert.ok(latestScoreFirst({createdAt:new Date(2),version:1},{createdAt:new Date(1),version:5})<0);
console.log(JSON.stringify({result:'UX regression PASS',temporaryData:tmp,selectedNotes:single.played.length,loopFinishes:repeated.finished,countInSeconds:counted.seconds-single.seconds,pcm:{normalRms:single.rms,louderRms:louder.rms,defaultPeak:louder.peak}},null,2));
sqlite.close();old.close();
