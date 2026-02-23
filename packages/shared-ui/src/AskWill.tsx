import { useState, useRef, useEffect } from 'react';
import { marked } from 'marked';
import { api } from '@deal-platform/shared-auth';
import willImage from './assets/will.png';
import styles from './AskWill.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Configure marked to open links in new tabs
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
      content: "Hey! Will here! Ready to crush some foreclosure deals? I've got all the insider tips to help you spot winners and avoid the duds. Ask me about today's daily challenge, or anything else about real estate investing!",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isNearFooter, setIsNearFooter] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
      setIsNearFooter(distanceFromBottom < 100);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    const conversationHistory = messages.slice(-10).map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const userInput = input;
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const placeholderMessage: Message = {
      role: 'assistant',
      content: '',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, placeholderMessage]);

    try {
      abortControllerRef.current = await api.chatStream(
        userInput,
        conversationHistory,
        true,
        // onChunk: append text to the last (assistant) message
        (chunk: string) => {
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              updated[updated.length - 1] = {
                ...lastMsg,
                content: lastMsg.content + chunk
              };
            }
            return updated;
          });
        },
        // onDone
        () => {
          setIsLoading(false);
          abortControllerRef.current = null;
        },
        // onError
        (error: Error) => {
          console.error('Chat stream error:', error);
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === '') {
              updated[updated.length - 1] = {
                ...lastMsg,
                content: "Oops! I'm having trouble connecting right now. Try again in a moment!"
              };
            }
            return updated;
          });
          setIsLoading(false);
          abortControllerRef.current = null;
        }
      );
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === '') {
          updated[updated.length - 1] = {
            ...lastMsg,
            content: "Oops! I'm having trouble connecting right now. Try again in a moment!"
          };
        }
        return updated;
      });
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
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          className={`${styles['chat-bubble']} ${isNearFooter ? styles['near-footer'] : ''}`}
          onClick={() => setIsOpen(true)}
          aria-label="Chat with Will"
        >
          <img src={willImage} alt="Ask Will" className={styles['chat-bubble-image']} />
          <div className={styles['chat-bubble-tooltip']}>
            How can I help?
          </div>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className={`${styles['chat-window']} ${isNearFooter ? styles['near-footer'] : ''} ${isExpanded ? styles['expanded'] : ''}`}>
          <div className={styles['chat-header']}>
            <div className={styles['chat-header-info']}>
              <img src={willImage} alt="Will" className={styles['chat-avatar']} />
              <div>
                <h3>Chat with Will</h3>
                <span className={styles['chat-status']}>Your Mom's Favorite Money Man</span>
              </div>
            </div>
            <div className={styles['chat-header-actions']}>
              <button
                className={styles['chat-expand']}
                onClick={() => setIsExpanded(!isExpanded)}
                aria-label={isExpanded ? 'Minimize chat' : 'Expand chat'}
                title={isExpanded ? 'Minimize' : 'Expand'}
              >
                {isExpanded ? '▼' : '▲'}
              </button>
              <button
                className={styles['chat-close']}
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          <div className={styles['chat-messages']}>
            {messages.map((message, index) => (
              // Skip rendering the empty placeholder message (streaming will fill it)
              message.role === 'assistant' && !message.content ? null : (
              <div
                key={index}
                className={`${styles['chat-message']} ${styles[message.role]}`}
              >
                <div className={styles['message-content']}>
                  {message.role === 'assistant' ? formatMessage(message.content) : message.content}
                </div>
                <div className={styles['message-timestamp']}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              )
            ))}
            {isLoading && messages[messages.length - 1]?.content === '' && (
              <div className={`${styles['chat-message']} ${styles['assistant']}`}>
                <div className={styles['message-content']}>
                  <div className={styles['typing-indicator']}>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className={styles['chat-input-container']}>
            <textarea
              className={styles['chat-input']}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="What's on your mind? Ask me anything!"
              rows={1}
              disabled={isLoading}
            />
            <button
              className={styles['chat-send']}
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
