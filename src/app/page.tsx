'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, AudioLines, CircleStop, Mic, MicOff, RotateCcw, Send, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { starterQuestions } from '@/data/persona';
type Exchange = { question: string; answer: string };
const maxAudioSeconds = 45;

type Status = 'idle' | 'preparing' | 'listening' | 'thinking' | 'speaking';
const audioTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];

function getAudioType(): string | null {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return null;
  return audioTypes.find(type => MediaRecorder.isTypeSupported(type)) || null;
}

export default function Home() {
  const [history, setHistory] = useState<Exchange[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [question, setQuestion] = useState('');
  const [showText, setShowText] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const conversationEnd = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<Status>('idle');
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);

  const updateStatus = (next: Status) => { statusRef.current = next; setStatus(next); };
  const isPreparing = () => statusRef.current === 'preparing';
  useEffect(() => {
    const supported = Boolean(getAudioType());
    setVoiceSupported(supported);
    if (!supported) setShowText(true);
    setSpeechSupported('speechSynthesis' in window);
    return () => { abort.current?.abort(); window.speechSynthesis?.cancel(); recorder.current?.stop(); stream.current?.getTracks().forEach(t => t.stop()); };
  }, []);
  useEffect(() => { conversationEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [history]);

  const stopSpeech = useCallback(() => {
    currentUtterance.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (statusRef.current === 'speaking') updateStatus('idle');
  }, []);

  const speak = useCallback((answer: string) => {
    if (muted || !('speechSynthesis' in window)) { updateStatus('idle'); return; }
    currentUtterance.current = null;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(answer);
    currentUtterance.current = utterance;
    utterance.rate = 1.02;
    utterance.onstart = () => { if (currentUtterance.current === utterance) updateStatus('speaking'); };
    utterance.onend = () => { if (currentUtterance.current === utterance) { currentUtterance.current = null; updateStatus('idle'); } };
    utterance.onerror = () => { if (currentUtterance.current === utterance) { currentUtterance.current = null; updateStatus('idle'); setError('Audio playback failed. You can still read the answer below.'); } };
    window.speechSynthesis.speak(utterance);
  }, [muted]);

  const send = async (path: string, body: BodyInit, headers?: HeadersInit) => {
    setError('');
    stopSpeech();
    updateStatus('thinking');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch(path, { method: 'POST', body, headers, signal: controller.signal });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : 'The assistant could not answer.');
      if (typeof data !== 'object' || data === null || !('question' in data) || !('answer' in data) || typeof data.question !== 'string' || typeof data.answer !== 'string') throw new Error('The assistant returned an invalid answer.');
      setHistory(current => [...current, { question: data.question as string, answer: data.answer as string }]);
      setQuestion('');
      speak(data.answer);
    } catch (cause) {
      updateStatus('idle');
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.');
    } finally { abort.current = null; }
  };

  const sendText = (value = question) => {
    const trimmed = value.trim();
    if (!trimmed || statusRef.current === 'thinking' || statusRef.current === 'preparing' || statusRef.current === 'listening') return;
    if (trimmed.length > 1000) { setError('Please keep your question under 1,000 characters.'); return; }
    void send('/api/ask', JSON.stringify({ question: trimmed, history: history.slice(-6) }), { 'Content-Type': 'application/json' });
  };

  const cleanupRecording = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    recorder.current = null;
    setSeconds(0);
  };

  const stopRecording = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  const startRecording = async () => {
    if (statusRef.current !== 'idle' && statusRef.current !== 'speaking') return;
    const mimeType = getAudioType();
    if (!mimeType) { setVoiceSupported(false); setShowText(true); setError('Voice recording is unavailable here. Please type your question.'); return; }
    stopSpeech();
    setError('');
    updateStatus('preparing');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!isPreparing()) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      chunks.current = [];
      const rec = new MediaRecorder(media, { mimeType, audioBitsPerSecond: 64_000 });
      recorder.current = rec;
      rec.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
      rec.onerror = () => { rec.onstop = null; cleanupRecording(); updateStatus('idle'); setError('Recording failed. Please try again or type your question.'); };
      rec.onstop = () => {
        const durationSeconds = Math.min(maxAudioSeconds, (Date.now() - startedAt.current) / 1000);
        const blob = new Blob(chunks.current, { type: mimeType });
        cleanupRecording();
        if (blob.size < 500 || durationSeconds < 0.2) { updateStatus('idle'); setError('The recording was too short. Please try again.'); return; }
        const form = new FormData();
        form.set('audio', blob, 'question');
        form.set('durationSeconds', String(durationSeconds));
        form.set('history', JSON.stringify(history.slice(-6)));
        void send('/api/voice', form);
      };
      rec.start(250);
      startedAt.current = Date.now();
      updateStatus('listening');
      timer.current = setInterval(() => {
        const elapsed = (Date.now() - startedAt.current) / 1000;
        setSeconds(Math.floor(elapsed));
        if (elapsed >= maxAudioSeconds) stopRecording();
      }, 250);
    } catch {
      cleanupRecording();
      updateStatus('idle');
      setShowText(true);
      setError('Microphone access was unavailable. You can type your question instead.');
    }
  };

  const cancel = () => {
    if (status === 'listening') {
      if (recorder.current) { recorder.current.onstop = null; recorder.current.stop(); }
      cleanupRecording();
    }
    abort.current?.abort();
    stopSpeech();
    updateStatus('idle');
    setError('');
  };

  const statusText = status === 'preparing' ? 'Waiting for microphone permission…' : status === 'listening' ? `Listening · ${seconds}s / ${maxAudioSeconds}s` : status === 'thinking' ? 'Thinking through your question…' : status === 'speaking' ? 'Speaking' : 'Ready when you are';

  return <main className="page-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <div className="content">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><AudioLines size={20} /></span><span>ASK PRAVEK <span className="brand-light">/ AI VOICE TWIN</span></span></div>
        <span className="top-badge"><span className="live-dot" /> Interactive AI experience</span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="eyebrow"><Sparkles size={14} /> THE CONVERSATION STARTS HERE</div>
        <h1 id="hero-title">Meet Pravek&apos;s <span>AI Twin.</span></h1>
        <p className="subtitle">Ask me about my journey, experience, strengths, projects, and ambitions. I&apos;ll answer as Pravek would.</p>
        <div className="hero-divider" />
        <div className="voice-stage">
          <div className={`mic-halo ${status === 'listening' ? 'is-listening' : ''} ${status === 'thinking' ? 'is-thinking' : ''}`}>
            <button className="mic-button" type="button" aria-label={status === 'listening' ? 'Stop recording' : 'Start speaking'} disabled={status === 'thinking' || status === 'preparing'} onClick={status === 'listening' ? stopRecording : startRecording}>
              {status === 'listening' ? <CircleStop size={34} strokeWidth={1.7} /> : <Mic size={34} strokeWidth={1.7} />}
            </button>
          </div>
          <div className="stage-label">{status === 'listening' ? 'Tap to stop recording' : voiceSupported ? 'Tap to start speaking' : 'Voice unavailable on this device'}</div>
          <div className="status" role="status"><span className={`status-dot status-${status}`} />{statusText}</div>
          {(status === 'preparing' || status === 'listening' || status === 'thinking') && <button className="text-button cancel-button" type="button" onClick={cancel}><X size={14} /> Cancel</button>}
        </div>
        <div className="alternate"><span />OR<span /></div>
        <button className="type-trigger" type="button" onClick={() => setShowText(current => !current)}>{showText ? 'Hide typed question' : 'Type a question instead'} <ArrowRight size={16} /></button>
        {showText && <form className="question-form" onSubmit={event => { event.preventDefault(); sendText(); }}>
          <label className="sr-only" htmlFor="question">Your question</label>
          <input id="question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="What would you like to know?" maxLength={1000} disabled={status === 'thinking' || status === 'preparing' || status === 'listening'} autoFocus />
          <button type="submit" aria-label="Send question" disabled={!question.trim() || status === 'thinking' || status === 'preparing' || status === 'listening'}><Send size={18} /></button>
        </form>}
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {history.length > 0 && <section className="conversation" aria-label="Conversation">
        <div className="section-heading"><span>THE CONVERSATION</span><span>{history.length.toString().padStart(2, '0')} {history.length === 1 ? 'EXCHANGE' : 'EXCHANGES'}</span></div>
        <div className="messages">{history.map((item, index) => <div className="exchange" key={index}>
          <div className="message-label"><span className="avatar visitor">YOU</span> YOUR QUESTION</div>
          <p className="user-message">{item.question}</p>
          <div className="answer-card"><div className="message-label"><span className="avatar twin"><AudioLines size={14} /></span> PRAVEK&apos;S AI TWIN</div><p>{item.answer}</p>
            <div className="answer-actions"><button type="button" onClick={() => { stopSpeech(); speak(item.answer); }} disabled={!speechSupported} aria-label="Replay answer"><RotateCcw size={15} /> Replay</button><button type="button" onClick={stopSpeech} disabled={status !== 'speaking'}><CircleStop size={15} /> Stop</button></div>
          </div>
        </div>)}</div><div ref={conversationEnd} />
        <div className="continue-note"><button type="button" className="type-trigger" onClick={() => { document.getElementById('hero-title')?.scrollIntoView({ behavior: 'smooth' }); if (!voiceSupported) setShowText(true); }}>Ask another question <ArrowRight size={15} /></button></div>
      </section>}

      <section className="starters" aria-labelledby="starters-title">
        <div className="section-heading"><span id="starters-title">NEED A STARTING POINT?</span><span>EXPLORE A QUESTION</span></div>
        <div className="question-grid">{starterQuestions.map((item, index) => <button key={item} className="starter-card" type="button" disabled={status === 'thinking' || status === 'preparing' || status === 'listening'} onClick={() => sendText(item)}><span className="card-number">0{index + 1}</span><span className="card-title">{item}</span><ArrowRight size={17} className="card-arrow" /></button>)}</div>
      </section>

      <footer className="footer"><span><Sparkles size={14} /> AI-powered representation of Pravek.</span><div className="footer-actions"><button type="button" onClick={() => { setMuted(value => !value); stopSpeech(); }} disabled={!speechSupported} aria-label={muted ? 'Unmute answers' : 'Mute answers'}>{muted ? <MicOff size={15} /> : <Volume2 size={15} />}{muted ? 'Unmute' : 'Mute'}</button>{status === 'speaking' && <button type="button" onClick={stopSpeech}><VolumeX size={15} /> Stop playback</button>}</div></footer>
    </div>
  </main>;
}
