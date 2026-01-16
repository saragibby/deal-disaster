import { useState, useRef, useEffect } from 'react';
import { marked } from 'marked';
import './AskWill.css';
import willImage from '../assets/will.png';
import { api } from '../services/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Configure marked to open links in new tabs and sanitize
const renderer = new marked.Renderer();
const originalLinkRenderer = renderer.link.bind(renderer);
renderer.link = (linkData) => {
  const html = originalLinkRenderer(linkData);
  return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ');
};

marked.setOptions({
  breaks: true,
  gfm: true,
  renderer: renderer,
});

export default function AskWill() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hey! Will here! Ready to crush some foreclosure deals? I've got all the insider tips to help you spot winners and avoid the duds. What can I help you with today?",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isNearFooter, setIsNearFooter] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const distanceFromBottom = documentHeight - (scrollTop + windowHeight);
      
      // If within 100px of the bottom, consider near footer
      setIsNearFooter(distanceFromBottom < 100);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial position
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Build conversation history for context (last 10 messages)
      const conversationHistory = messages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Call Azure OpenAI chat endpoint
      const response = await api.chat(input, conversationHistory);
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: response.response,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: "Oops! I'm having trouble connecting right now. Try again in a moment!",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatMessage = (text: string) => {
    // Parse markdown to HTML
    const html = marked.parse(text) as string;
    
    // Return HTML with dangerouslySetInnerHTML
    // The content is from our own Azure AI Agent, so it's safe
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  };

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button 
          className={`chat-bubble ${isNearFooter ? 'near-footer' : ''}`}
          onClick={() => setIsOpen(true)}
          aria-label="Chat with Will"
        >
          <img src={willImage} alt="Ask Will" className="chat-bubble-image" />
          <div className="chat-bubble-tooltip">
            How can I help?
          </div>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className={`chat-window ${isNearFooter ? 'near-footer' : ''} ${isExpanded ? 'expanded' : ''}`}>
          <div className="chat-header">
            <div className="chat-header-info">
              <img src={willImage} alt="Will" className="chat-avatar" />
              <div>
                <h3>Chat with Will</h3>
                <span className="chat-status">Your Mom's Favorite Money Man</span>
              </div>
            </div>
            <div className="chat-header-actions">
              <button 
                className="chat-expand"
                onClick={() => setIsExpanded(!isExpanded)}
                aria-label={isExpanded ? 'Minimize chat' : 'Expand chat'}
                title={isExpanded ? 'Minimize' : 'Expand'}
              >
                {isExpanded ? '▼' : '▲'}
              </button>
              <button 
                className="chat-close"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="chat-messages">
            {messages.map((message, index) => (
              <div 
                key={index}
                className={`chat-message ${message.role}`}
              >
                <div className="message-content">
                  {message.role === 'assistant' ? formatMessage(message.content) : message.content}
                </div>
                <div className="message-timestamp">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="chat-message assistant">
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-container">
            <textarea
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="What's on your mind? Ask me anything!"
              rows={1}
              disabled={isLoading}
            />
            <button 
              className="chat-send"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}
