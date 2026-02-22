import { useState, useRef, useEffect } from 'react';
import { marked } from 'marked';
import { api } from '@deal-platform/shared-auth';
import willImage from '../assets/will.png';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Configure marked for links in new tabs
const renderer = new marked.Renderer();
const originalLinkRenderer = renderer.link.bind(renderer);
renderer.link = (linkData) => {
  const html = originalLinkRenderer(linkData);
  return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ');
};

marked.setOptions({ breaks: true, gfm: true, renderer });

export default function AskWill() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hey! Will here! Ready to crush some foreclosure deals? I've got all the insider tips to help you spot winners and avoid the duds. Ask me anything about real estate investing!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isNearFooter, setIsNearFooter] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleScroll = () => {
      const distanceFromBottom =
        document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      setIsNearFooter(distanceFromBottom < 100);
    };
    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await api.chat(input, conversationHistory);

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: response.response, timestamp: new Date() },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: "Oops! I'm having trouble connecting right now. Try again in a moment!",
          timestamp: new Date(),
        },
      ]);
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
    const html = marked.parse(text) as string;
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  };

  return (
    <>
      {!isOpen && (
        <button
          className={`chat-bubble ${isNearFooter ? 'near-footer' : ''}`}
          onClick={() => setIsOpen(true)}
          aria-label="Chat with Will"
        >
          <img src={willImage} alt="Ask Will" className="chat-bubble-image" />
          <div className="chat-bubble-tooltip">How can I help?</div>
        </button>
      )}

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
              <button className="chat-close" onClick={() => setIsOpen(false)} aria-label="Close chat">
                ✕
              </button>
            </div>
          </div>

          <div className="chat-messages">
            {messages.map((message, index) => (
              <div key={index} className={`chat-message ${message.role}`}>
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
                    <span />
                    <span />
                    <span />
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
              onChange={e => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="What's on your mind? Ask me anything!"
              rows={1}
              disabled={isLoading}
            />
            <button className="chat-send" onClick={handleSend} disabled={!input.trim() || isLoading}>
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}
