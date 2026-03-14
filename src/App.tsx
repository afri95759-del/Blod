/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { Send, Trash2, Sparkles, User, Terminal, Mic, MicOff, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

// Type definition for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<{ id: number; text: string; type: 'user' | 'system' | 'ai' }[]>(() => {
    const saved = localStorage.getItem('conversation_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(!process.env.GEMINI_API_KEY);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    // Save to localStorage whenever output changes
    localStorage.setItem('conversation_history', JSON.stringify(output));
  }, [output]);

  useEffect(() => {
    // Check for API key on mount
    if (!process.env.GEMINI_API_KEY) {
      setIsApiKeyMissing(true);
    }
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        setInput(transcript);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    const userMsgId = Date.now();
    const newUserMsg = { id: userMsgId, text: userText, type: 'user' as const };
    
    setOutput(prev => [...prev, newUserMsg]);
    setInput('');
    setIsLoading(true);

    if (isRecording) {
      recognitionRef.current?.stop();
    }

    if (!process.env.GEMINI_API_KEY) {
      const errorMsg = { 
        id: Date.now() + 1, 
        text: "Error: GEMINI_API_KEY is missing. Please configure it in the Secrets panel.", 
        type: 'system' as const 
      };
      setOutput(prev => [...prev, errorMsg]);
      setIsLoading(false);
      setIsApiKeyMissing(true);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: userText,
        config: {
          systemInstruction: "You are a helpful, concise AI assistant integrated into a modern web tool. Keep your responses brief and professional.",
        }
      });

      const aiText = response.text || "I'm sorry, I couldn't generate a response.";
      const newAiMsg = { id: Date.now() + 1, text: aiText, type: 'ai' as const };
      setOutput(prev => [...prev, newAiMsg]);
    } catch (error) {
      console.error("Gemini API Error:", error);
      const errorMsg = { 
        id: Date.now() + 1, 
        text: "Error: Failed to connect to AI service. Please check your API key.", 
        type: 'system' as const 
      };
      setOutput(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearOutput = () => {
    setOutput([]);
    localStorage.removeItem('conversation_history');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Sparkles className="text-zinc-950 w-6 h-6" />
            </div>
            <div>
              <h1 className="font-semibold text-lg tracking-tight">Interactive Web Tool</h1>
              <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">System v1.0.0</p>
            </div>
          </div>
          <button 
            onClick={clearOutput}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors text-zinc-500 hover:text-red-400"
            title="Clear History"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 pb-32">
        {/* API Key Warning */}
        <AnimatePresence>
          {isApiKeyMissing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-hidden"
            >
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 text-red-400 text-sm">
                <Terminal size={18} className="shrink-0" />
                <p>
                  <span className="font-bold">Configuration Required:</span> GEMINI_API_KEY is missing. 
                  Please add it to the <span className="underline font-mono">Secrets</span> panel in AI Studio.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Output Display */}
        <div className="space-y-6 min-h-[400px]">
          <AnimatePresence initial={false}>
            {output.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-20 text-zinc-600"
              >
                <Terminal size={48} className="mb-4 opacity-20" />
                <p className="text-sm font-mono">Waiting for input...</p>
              </motion.div>
            ) : (
              <>
                {output.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, x: msg.type === 'user' ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex gap-4 ${msg.type === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      msg.type === 'user' 
                        ? 'bg-zinc-800' 
                        : msg.type === 'ai' 
                          ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20' 
                          : 'bg-red-500/10 text-red-500'
                    }`}>
                      {msg.type === 'user' ? <User size={16} /> : <Sparkles size={16} />}
                    </div>
                    <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${
                      msg.type === 'user' 
                        ? 'bg-zinc-800 text-zinc-200 rounded-tr-none' 
                        : msg.type === 'ai'
                          ? 'bg-zinc-900 border border-emerald-500/20 text-zinc-100 rounded-tl-none'
                          : 'bg-red-500/5 border border-red-500/20 text-red-400 rounded-tl-none italic'
                    }`}>
                      {msg.text}
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-4 items-start"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500 text-zinc-950 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20">
                      <Sparkles size={16} className="animate-pulse" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="bg-zinc-900 border border-emerald-500/20 p-4 rounded-2xl rounded-tl-none shadow-2xl shadow-emerald-500/5">
                        <div className="flex gap-1.5 items-center h-4">
                          <motion.span 
                            animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                            transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                            className="w-2 h-2 bg-emerald-500 rounded-full"
                          />
                          <motion.span 
                            animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                            transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                            className="w-2 h-2 bg-emerald-500 rounded-full"
                          />
                          <motion.span 
                            animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                            transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                            className="w-2 h-2 bg-emerald-500 rounded-full"
                          />
                        </div>
                      </div>
                      <span className="text-[10px] text-emerald-500/60 font-mono uppercase tracking-widest ml-1">
                        Gemini is generating...
                      </span>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Input Area */}
      <footer className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent pt-10 pb-8 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative group">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isLoading ? "AI is thinking..." : "Type something to interact..."}
              disabled={isLoading}
              className="w-full bg-zinc-900 border border-white/10 rounded-2xl px-6 py-4 pr-28 focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 transition-all placeholder:text-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                onClick={toggleRecording}
                disabled={isLoading}
                className={`p-2 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  isRecording 
                    ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/20' 
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
                title={isRecording ? 'Stop Recording' : 'Start Voice Input'}
              >
                {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="p-2 bg-emerald-500 text-zinc-950 rounded-xl hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center min-w-[40px]"
              >
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
            </div>
          </div>
          <p className="text-center text-[10px] text-zinc-600 mt-4 font-mono uppercase tracking-widest">
            Press Enter to Send • Built with React & Tailwind
          </p>
        </div>
      </footer>
    </div>
  );
}
