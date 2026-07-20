'use client';

import { useState, useEffect, useRef } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import ProtectedShell from '@/components/layout/ProtectedShell';
import { getReminders, saveReminders, type Reminder } from '@/lib/reminders';
import { getSession, type Session } from '@/lib/session';
import { recordUntilSilence } from '@/lib/recordSpeech';
import { transcribeAudio, preloadWhisper } from '@/lib/whisper';
import { appendHistory } from '@/lib/history';
import {
  PhoneIcon,
  ClipboardIcon,
  SmileIcon,
  PillIcon,
  UtensilsIcon,
  FootprintsIcon,
  CheckIcon,
  MicIcon,
  SendIcon,
  RobotIcon,
  ChevronRightIcon,
} from '@/components/icons';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type VoiceState = 'off' | 'wake-listening' | 'capturing' | 'transcribing' | 'suspended';

const WAKE_WORD_PATTERN = /뉴\s*로\s*야[,.!]?\s*/;

const QUICK_ACTIONS = [
  { label: '가족 연결', prompt: '아들에게 전화해줘', Icon: PhoneIcon, bg: 'bg-mint-soft', fg: 'text-mint' },
  { label: '오늘의 계획', prompt: '오늘 일정 알려줘', Icon: ClipboardIcon, bg: 'bg-sky-soft', fg: 'text-navy' },
  { label: '기분 체크', prompt: '내 기분은 어때?', Icon: SmileIcon, bg: 'bg-sand-soft', fg: 'text-navy' },
];

const REMINDER_ICONS = { pill: PillIcon, utensils: UtensilsIcon, footprints: FootprintsIcon };

export default function NeuroCareChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [stage, setStage] = useState<'mild' | 'moderate' | 'severe'>('moderate');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [voiceState, setVoiceStateRaw] = useState<VoiceState>('off');
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceStateRef = useRef<VoiceState>('off');
  const messagesRef = useRef<Message[]>([]);
  const stageRef = useRef(stage);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const setVoiceState = (v: VoiceState) => {
    voiceStateRef.current = v;
    setVoiceStateRaw(v);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startWakeListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceState('off');
      setVoiceError('이 브라우저는 음성 인식을 지원하지 않아요. Chrome 브라우저를 사용해보세요.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ko-KR';

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript: string = result[0].transcript;
        const isFinal: boolean = result.isFinal;
        handleSpeechSegment(transcript, isFinal);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        voiceStateRef.current = 'off';
        setVoiceStateRaw('off');
        setVoiceError('마이크 권한이 거부됐어요. 주소창 왼쪽의 자물쇠(또는 마이크) 아이콘에서 마이크 권한을 허용해주세요.');
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setVoiceError(`음성 인식 오류: ${event.error}`);
      }
      // no-speech / aborted 등은 onend에서 재시작 처리
    };

    recognition.onend = () => {
      if (voiceStateRef.current === 'wake-listening') {
        try {
          recognition.start();
        } catch {
          // 이미 시작된 경우 무시
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setVoiceState('wake-listening');
      setVoiceError(null);
    } catch (e: any) {
      setVoiceState('off');
      setVoiceError(`음성 인식을 시작할 수 없어요: ${e?.message || '알 수 없는 오류'}`);
    }
  };

  useEffect(() => {
    const s = getSession();
    if (!s) return; // 로그인하지 않은 경우 ProtectedShell이 /login으로 이동시킴

    setSession(s);
    sessionRef.current = s;
    setReminders(getReminders());
    startWakeListening();
    preloadWhisper();

    return () => {
      voiceStateRef.current = 'off';
      try {
        recognitionRef.current?.stop();
      } catch {
        // noop
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSpeechSegment = (transcript: string, isFinal: boolean) => {
    if (voiceStateRef.current !== 'wake-listening') return;
    const match = transcript.match(WAKE_WORD_PATTERN);
    if (match && isFinal) {
      startCommandCapture();
    }
  };

  // "뉴로야" 감지 후: Web Speech를 잠시 멈추고, 마이크로 명령을 녹음해 Whisper(오픈소스)로 정밀하게 전사
  const startCommandCapture = async () => {
    setVoiceState('capturing');
    try {
      recognitionRef.current?.stop();
    } catch {
      // noop
    }

    try {
      const { blob, hadSpeech } = await recordUntilSilence();

      if (!hadSpeech) {
        // 말소리가 감지되지 않음 (무음/노이즈만 녹음됨) — Whisper에 넘기면 엉뚱한 텍스트를 만들어낼 수 있어 건너뜀
        setVoiceState('wake-listening');
        startWakeListening();
        setVoiceError('말씀하신 내용을 듣지 못했어요. "뉴로야"라고 부른 뒤 다시 말씀해주세요.');
        return;
      }

      setVoiceState('transcribing');
      const text = await transcribeAudio(blob);

      setVoiceState('wake-listening');
      startWakeListening();

      if (text) {
        setVoiceError(null);
        await handleUserInput(text);
      } else {
        setVoiceError('말씀하신 내용을 알아듣지 못했어요. 다시 시도해주세요.');
      }
    } catch (err: any) {
      console.error('음성 캡처 오류:', err);
      const reason =
        err?.name === 'NotAllowedError'
          ? '마이크 권한이 거부됐어요.'
          : err?.message || err?.name || '알 수 없는 오류';
      setVoiceError(`음성 명령 처리 중 오류가 발생했어요: ${reason}`);
      setVoiceState('wake-listening');
      startWakeListening();
    }
  };

  const handleUserInput = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    appendHistory({ role: 'user', content: text });
    setIsProcessing(true);
    setInputText('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userText: text,
          stage: stageRef.current,
          history: messagesRef.current,
          patientId: sessionRef.current?.patientId,
        }),
      });

      if (!response.ok) throw new Error('LLM 응답 실패');

      const reader = response.body?.getReader();
      if (!reader) return;

      let assistantText = '';
      const assistantMessage: Message = { role: 'assistant', content: '' };
      setMessages(prev => [...prev, assistantMessage]);

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              assistantText += data;
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, content: assistantText } : m
              ));
            } catch (e) {
              // 파싱 오류 무시
            }
          }
        }
      }

      setIsProcessing(false);
      appendHistory({ role: 'assistant', content: assistantText });
      await playTTS(assistantText);
    } catch (error) {
      console.error('Error:', error);
      setIsProcessing(false);
    }
  };

  const playTTS = async (text: string) => {
    const wasListening = voiceStateRef.current === 'wake-listening';
    if (wasListening) {
      setVoiceState('suspended');
      try {
        recognitionRef.current?.stop();
      } catch {
        // noop
      }
    }

    const resume = () => {
      if (wasListening) startWakeListening();
    };

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error('TTS 생성 실패');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resume();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resume();
      };
      await audio.play();
    } catch (error) {
      console.error('TTS 재생 오류:', error);
      resume();
    }
  };

  const toggleStage = () => {
    const stages: Array<'mild' | 'moderate' | 'severe'> = ['mild', 'moderate', 'severe'];
    const currentIndex = stages.indexOf(stage);
    const nextIndex = (currentIndex + 1) % stages.length;
    setStage(stages[nextIndex]);
  };

  const nextReminder = reminders.find(r => !r.completed);

  const completeReminder = (id: string) => {
    const updated = reminders.map(r => (r.id === id ? { ...r, completed: true } : r));
    setReminders(updated);
    saveReminders(updated);
  };

  const goHome = () => setMessages([]);

  const toggleManualCapture = () => {
    if (voiceStateRef.current === 'wake-listening') {
      startCommandCapture();
    } else if (voiceStateRef.current === 'off') {
      startWakeListening();
    }
    // capturing / transcribing / suspended 중에는 무시
  };

  const statusText = {
    off: '마이크를 사용할 수 없어요',
    'wake-listening': `"뉴로야"라고 불러보세요`,
    capturing: '듣고 있어요...',
    transcribing: '알아듣는 중...',
    suspended: '응답 준비 중...',
  }[voiceState];

  const statusDotClass = {
    off: 'bg-red-400',
    'wake-listening': 'bg-mint animate-pulse',
    capturing: 'bg-white animate-pulse',
    transcribing: 'bg-amber-300 animate-pulse',
    suspended: 'bg-mint',
  }[voiceState];

  return (
    <ProtectedShell>
    <div className="min-h-screen flex flex-col pb-28">
      <AppHeader showGuardianLink />

      {messages.length === 0 ? (
        <main className="flex-1 px-5 pt-4 space-y-8">
          <div className="flex justify-center">
            <div className="relative w-48 h-48">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-sky-soft to-mint-soft blur-2xl opacity-70" />
              <div className="relative w-full h-full rounded-3xl bg-white shadow-soft flex items-center justify-center">
                <RobotIcon className="w-20 h-20 text-navy" />
              </div>
            </div>
          </div>

          <div className="text-center space-y-1">
            <h1 className="text-3xl font-bold text-navy leading-snug">
              안녕하세요{session ? `, ${session.name}님` : ''}!
            </h1>
            <h1 className="text-3xl font-bold text-navy leading-snug">무엇을 도와드릴까요?</h1>
          </div>

          <div className="flex justify-center gap-2">
            <button
              onClick={toggleStage}
              className="text-xs px-3 py-1.5 rounded-full bg-white shadow-card text-ink-muted"
            >
              단계: <span className="font-semibold text-navy">{stage.toUpperCase()}</span>
            </button>
            <button
              onClick={toggleManualCapture}
              className={`text-xs px-3 py-1.5 rounded-full shadow-card flex items-center gap-1.5 ${
                voiceState === 'capturing' || voiceState === 'transcribing' ? 'bg-mint text-white' : 'bg-white text-ink-muted'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`} />
              {statusText}
            </button>
          </div>

          {voiceError && (
            <p className="text-xs text-red-500 text-center px-6">{voiceError}</p>
          )}

          <div className="grid grid-cols-3 gap-3">
            {QUICK_ACTIONS.map(({ label, prompt, Icon, bg, fg }) => (
              <button
                key={label}
                onClick={() => handleUserInput(prompt)}
                className="bg-white rounded-2xl shadow-card p-4 text-left flex flex-col gap-3 hover:shadow-soft transition-shadow"
              >
                <span className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${fg}`} />
                </span>
                <span className="text-xs text-ink-muted">{label}</span>
                <span className="text-sm font-bold text-navy leading-snug">&quot;{prompt}&quot;</span>
              </button>
            ))}
          </div>

          {nextReminder && (
            <div className="bg-white rounded-2xl shadow-card p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="w-11 h-11 rounded-full bg-mint-soft flex items-center justify-center shrink-0">
                  {(() => {
                    const Icon = REMINDER_ICONS[nextReminder.icon];
                    return <Icon className="w-5 h-5 text-mint" />;
                  })()}
                </span>
                <div>
                  <p className="font-bold text-navy">{nextReminder.title}입니다</p>
                  <p className="text-sm text-ink-muted">{nextReminder.timeLabel} · {nextReminder.subtitle}</p>
                </div>
              </div>
              <button
                onClick={() => completeReminder(nextReminder.id)}
                className="shrink-0 px-4 py-2.5 rounded-full bg-navy text-white text-sm font-semibold hover:bg-navy-light"
              >
                완료했어요
              </button>
            </div>
          )}
        </main>
      ) : (
        <main className="flex-1 px-5 pt-2 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={goHome}
              className="flex items-center gap-1 text-sm text-ink-muted"
            >
              <ChevronRightIcon className="w-4 h-4 rotate-180" />
              홈으로
            </button>
            <button
              onClick={toggleManualCapture}
              className={`text-xs px-3 py-1.5 rounded-full shadow-card flex items-center gap-1.5 ${
                voiceState === 'capturing' || voiceState === 'transcribing' ? 'bg-mint text-white' : 'bg-white text-ink-muted'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`} />
              {statusText}
            </button>
          </div>

          {voiceError && (
            <p className="text-xs text-red-500 text-center px-6 mb-2">{voiceError}</p>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto no-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-navy text-white'
                      : 'bg-white text-navy shadow-card'
                  }`}
                >
                  {msg.content || (isProcessing && idx === messages.length - 1 ? '···' : '')}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </main>
      )}

      <div className="fixed bottom-16 left-0 right-0 px-5 pb-3 pt-2 bg-gradient-to-t from-canvas via-canvas to-transparent">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <button
            onClick={toggleManualCapture}
            aria-label="음성 입력"
            className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-white transition-colors ${
              voiceState === 'capturing'
                ? 'bg-red-500'
                : voiceState === 'transcribing'
                ? 'bg-amber-500'
                : 'bg-mint'
            }`}
          >
            <MicIcon className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUserInput(inputText)}
            placeholder="메시지를 입력하거나 마이크를 사용하세요"
            className="flex-1 min-w-0 px-4 py-3 bg-white rounded-full shadow-card text-navy placeholder:text-ink-faint focus:outline-none"
            disabled={isProcessing}
          />

          <button
            onClick={() => handleUserInput(inputText)}
            disabled={isProcessing || !inputText.trim()}
            aria-label="전송"
            className="shrink-0 w-11 h-11 rounded-full bg-navy text-white flex items-center justify-center disabled:opacity-40"
          >
            <SendIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
    </ProtectedShell>
  );
}
