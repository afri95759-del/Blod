/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Send, Trash2, Sparkles, User, Terminal, Mic, MicOff, Loader2, Paperclip, Image as ImageIcon, Video, File, X, Download, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

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

interface FileData {
  name: string;
  type: string;
  data: string; // base64
  preview?: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [input, setInput] = useState('');
  const [isBookMode, setIsBookMode] = useState(false);
  const [bookTitle, setBookTitle] = useState('My New Book');
  const [selectedFiles, setSelectedFiles] = useState<FileData[]>([]);
  const [output, setOutput] = useState<{ id: number; text: string; type: 'user' | 'system' | 'ai'; files?: FileData[] }[]>(() => {
    const saved = localStorage.getItem('conversation_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(!process.env.GEMINI_API_KEY);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: FileData[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      
      const filePromise = new Promise<FileData>((resolve) => {
        reader.onload = (e) => {
          const base64 = e.target?.result as string;
          const data = base64.split(',')[1];
          const fileData: FileData = {
            name: file.name,
            type: file.type,
            data: data,
            preview: file.type.startsWith('image/') ? base64 : undefined
          };
          resolve(fileData);
        };
      });
      
      reader.readAsDataURL(file);
      newFiles.push(await filePromise);
    }
    
    setSelectedFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const exportToPDF = async (elementId: string, msgTitle?: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    try {
      setIsLoading(true);
      
      // Create a temporary container for the PDF content to add a title page
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.width = '800px';
      container.style.backgroundColor = '#18181b';
      container.style.color = '#f4f4f5';
      container.style.padding = '60px';
      container.style.fontFamily = 'sans-serif';
      
      if (isBookMode) {
        const titlePage = document.createElement('div');
        titlePage.style.height = '1000px';
        titlePage.style.display = 'flex';
        titlePage.style.flexDirection = 'column';
        titlePage.style.justifyContent = 'center';
        titlePage.style.alignItems = 'center';
        titlePage.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        titlePage.style.marginBottom = '60px';
        titlePage.style.textAlign = 'center';
        
        const title = document.createElement('h1');
        title.innerText = bookTitle;
        title.style.fontSize = '48px';
        title.style.marginBottom = '20px';
        title.style.color = '#10b981';
        
        const subtitle = document.createElement('p');
        subtitle.innerText = 'Generated by alilo ai';
        subtitle.style.fontSize = '18px';
        subtitle.style.opacity = '0.6';
        subtitle.style.letterSpacing = '4px';
        subtitle.style.textTransform = 'uppercase';
        
        titlePage.appendChild(title);
        titlePage.appendChild(subtitle);
        container.appendChild(titlePage);
      }

      const contentClone = element.cloneNode(true) as HTMLElement;
      // Remove the export button from the clone
      const exportBtn = contentClone.querySelector('.no-export');
      if (exportBtn) exportBtn.remove();
      
      contentClone.style.width = '100%';
      contentClone.style.maxWidth = 'none';
      contentClone.style.backgroundColor = 'transparent';
      contentClone.style.border = 'none';
      contentClone.style.padding = '0';
      
      container.appendChild(contentClone);
      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#18181b',
      });
      
      document.body.removeChild(container);
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${isBookMode ? bookTitle : 'alilo-ai-export'}-${Date.now()}.pdf`);
    } catch (error) {
      console.error("PDF Export Error:", error);
      alert("Failed to export PDF. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && selectedFiles.length === 0) || isLoading) return;

    const userText = input.trim();
    const userMsgId = Date.now();
    const newUserMsg = { 
      id: userMsgId, 
      text: userText || (selectedFiles.length > 0 ? "Sent attachments" : ""), 
      type: 'user' as const,
      files: selectedFiles.length > 0 ? [...selectedFiles] : undefined
    };
    
    setOutput(prev => [...prev, newUserMsg]);
    setInput('');
    setSelectedFiles([]);
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
      
      const parts: any[] = [];
      if (userText) parts.push({ text: userText });
      
      newUserMsg.files?.forEach(file => {
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
          parts.push({
            inlineData: {
              mimeType: file.type,
              data: file.data
            }
          });
        } else {
          parts.push({ text: `[Attached File: ${file.name} (${file.type})]` });
        }
      });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts },
        config: {
          systemInstruction: isBookMode 
            ? `You are a professional book author writing a book titled "${bookTitle}". 
               When asked to write, use clear Markdown formatting. 
               Structure your content with:
               - A clear Title (H1)
               - Logical Chapters (H2)
               - Subheadings (H3)
               - Use bold text for emphasis.
               - If the user provides images, incorporate descriptions or references to them in the text.
               - Write in a sophisticated, engaging tone suitable for a published book.`
            : "You are a helpful, concise AI assistant integrated into a modern web tool. You can see images and videos if provided. Keep your responses brief and professional.",
        }
      });

      const aiText = response.text || "I've received your input.";
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
              <h1 className="font-semibold text-lg tracking-tight">alilo ai</h1>
              <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">System v1.0.0</p>
            </div>
            <button
              onClick={() => setIsBookMode(!isBookMode)}
              className={`ml-4 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all ${
                isBookMode 
                  ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20' 
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              <BookOpen size={14} />
              {isBookMode ? 'Book Mode Active' : 'Normal Mode'}
            </button>
            {isBookMode && (
              <div className="flex items-center gap-4 ml-4">
                <input
                  type="text"
                  value={bookTitle}
                  onChange={(e) => setBookTitle(e.target.value)}
                  placeholder="Enter Book Title..."
                  className="bg-zinc-800/50 border border-white/10 rounded-lg px-3 py-1 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500/50 w-48"
                />
                <span className="text-[10px] text-zinc-500 italic">Tip: Ask for chapters or a full outline!</span>
              </div>
            )}
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
                    <div 
                      id={`msg-${msg.id}`}
                      style={{ 
                        backgroundColor: msg.type === 'user' ? '#27272a' : msg.type === 'ai' ? '#18181b' : '#450a0a',
                        borderColor: msg.type === 'ai' ? 'rgba(16, 185, 129, 0.2)' : msg.type === 'system' ? 'rgba(239, 68, 68, 0.2)' : 'transparent'
                      }}
                      className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed border ${
                      msg.type === 'user' 
                        ? 'text-zinc-200 rounded-tr-none' 
                        : msg.type === 'ai'
                          ? 'text-zinc-100 rounded-tl-none'
                          : 'text-red-400 rounded-tl-none italic'
                    }`}>
                      {msg.files && msg.files.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {msg.files.map((file, idx) => (
                            <div key={idx} className="relative group/file">
                              {file.preview ? (
                                <img src={file.preview} alt={file.name} className="w-32 h-32 object-cover rounded-lg border border-white/10" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-32 h-32 bg-zinc-950 rounded-lg border border-white/10 flex flex-col items-center justify-center p-2 text-center">
                                  {file.type.startsWith('video/') ? <Video size={24} className="text-emerald-500 mb-1" /> : <File size={24} className="text-zinc-500 mb-1" />}
                                  <span className="text-[10px] truncate w-full opacity-60">{file.name}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.text}
                        </ReactMarkdown>
                      </div>

                      {msg.type === 'ai' && (
                        <div className="mt-4 pt-3 border-t border-white/5 flex justify-end no-export">
                          <button
                            onClick={() => exportToPDF(`msg-${msg.id}`)}
                            className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-emerald-500 hover:text-emerald-400 transition-colors"
                          >
                            <Download size={12} />
                            Export as PDF Book
                          </button>
                        </div>
                      )}
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
          {/* Selected Files Preview */}
          <AnimatePresence>
            {selectedFiles.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex flex-wrap gap-2 mb-4 p-2 bg-zinc-900/50 border border-white/5 rounded-xl backdrop-blur-sm"
              >
                {selectedFiles.map((file, idx) => (
                  <div key={idx} className="relative group/file">
                    {file.preview ? (
                      <img src={file.preview} alt={file.name} className="w-16 h-16 object-cover rounded-lg border border-white/10" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-16 h-16 bg-zinc-950 rounded-lg border border-white/10 flex flex-col items-center justify-center p-1 text-center">
                        {file.type.startsWith('video/') ? <Video size={16} className="text-emerald-500" /> : <File size={16} className="text-zinc-500" />}
                        <span className="text-[8px] truncate w-full opacity-60 px-1">{file.name}</span>
                      </div>
                    )}
                    <button 
                      onClick={() => removeFile(idx)}
                      className="absolute -top-1.5 -right-1.5 bg-zinc-950 text-white rounded-full p-0.5 border border-white/10 opacity-0 group-hover/file:opacity-100 transition-opacity"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative group">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              className="hidden"
              accept="image/*,video/*,.zip,.pdf,.txt"
            />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isLoading ? "AI is thinking..." : "Type something or attach files..."}
              disabled={isLoading}
              className="w-full bg-zinc-900 border border-white/10 rounded-2xl px-6 py-4 pr-36 focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 transition-all placeholder:text-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="p-2 bg-zinc-800 text-zinc-400 rounded-xl hover:bg-zinc-700 disabled:opacity-50 transition-all"
                title="Attach Files"
              >
                <Paperclip size={20} />
              </button>
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
                disabled={(!input.trim() && selectedFiles.length === 0) || isLoading}
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
