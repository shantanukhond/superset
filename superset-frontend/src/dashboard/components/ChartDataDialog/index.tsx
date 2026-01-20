/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { FC, useState, useRef, useEffect } from 'react';
import { t } from '@superset-ui/core';
import styled from '@emotion/styled';
import Modal from 'src/components/Modal';
import Button from 'src/components/Button';
import { useChartDataInterceptor } from '../ChartDataInterceptor';
import { Input } from 'antd';
import getBootstrapData from 'src/utils/getBootstrapData';
import parseCookie from 'src/utils/parseCookie';

interface ChartDataDialogProps {
  show: boolean;
  onHide: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const DialogContent = styled.div`
  display: flex;
  flex-direction: column;
  height: 600px;
`;

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background-color: ${({ theme }) => theme.colors.grayscale.light5};
`;

const MessageBubble = styled.div<{ isUser: boolean }>`
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 8px;
  align-self: ${({ isUser }) => (isUser ? 'flex-end' : 'flex-start')};
  background-color: ${({ theme, isUser }) =>
    isUser ? theme.colors.primary.base : theme.colors.grayscale.light4};
  color: ${({ theme, isUser }) =>
    isUser ? 'white' : theme.colors.grayscale.dark2};
  word-wrap: break-word;
  white-space: pre-wrap;
`;

const InputContainer = styled.div`
  display: flex;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.grayscale.light2};
  background-color: ${({ theme }) => theme.colors.grayscale.light5};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 32px;
  color: ${({ theme }) => theme.colors.grayscale.base};
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LoadingIndicator = styled.div`
  padding: 10px 14px;
  color: ${({ theme }) => theme.colors.grayscale.base};
  font-style: italic;
`;

const DEFAULT_MESSAGE = 'Provide me analysis of this dashboard';

const ChartDataDialog: FC<ChartDataDialogProps> = ({ show, onHide }) => {
  const { chartData } = useChartDataInterceptor();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);
  const hasInitialMessageSent = useRef(false);

  const chartDataKeys = Object.keys(chartData);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when dialog opens
  useEffect(() => {
    if (show && inputRef.current) {
      inputRef.current.focus();
    }
  }, [show]);

  // Send default message when dialog opens with chart data
  useEffect(() => {
    if (show && chartDataKeys.length > 0 && !hasInitialMessageSent.current && !isLoading) {
      hasInitialMessageSent.current = true;
      sendMessage(DEFAULT_MESSAGE);
    }
  }, [show, chartDataKeys.length]);

  // Reset initial message flag when dialog closes
  useEffect(() => {
    if (!show) {
      hasInitialMessageSent.current = false;
    }
  }, [show]);

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading || chartDataKeys.length === 0) {
      return;
    }

    const userMessage: Message = { role: 'user', content: messageText.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      // Create system prompt with chart data
      const systemPrompt = `You are a data analyst assistant helping users understand their dashboard data.

Available Chart Data:
${JSON.stringify(chartData, null, 2)}

Use this data to answer user questions accurately.`;

      // Get CSRF token (same logic as setupClient)
      const bootstrapData = getBootstrapData();
      const csrfNode = document.querySelector<HTMLInputElement>('#csrf_token');
      const csrfToken = csrfNode?.value;
      const jwtAccessCsrfCookieName =
        bootstrapData.common.conf.JWT_ACCESS_CSRF_COOKIE_NAME;
      const cookieCSRFToken = parseCookie()[jwtAccessCsrfCookieName] || '';
      const token = csrfToken || cookieCSRFToken;

      // Prepare headers with CSRF token if available
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['X-CSRFToken'] = token;
      }

      // Call Anthropic API through backend proxy to avoid CORS issues
      const anthropicResponse = await fetch('/api/v1/chat/anthropic', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          system: systemPrompt,
          messages: updatedMessages.map(({ role, content }) => ({ role, content })),
          max_tokens: 1024,
        }),
      });

      if (!anthropicResponse.ok) {
        const errorData = await anthropicResponse.json();
        throw new Error(errorData.error?.message || 'API request failed');
      }

      const anthropicData = await anthropicResponse.json();
      const assistantContent = anthropicData.content[0]?.text || 'No response received';

      // Add assistant response to messages
      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantContent,
      };

      setMessages([...updatedMessages, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
      };
      setMessages([...updatedMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = () => {
    sendMessage(inputValue);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      title={t('Dashboard Chat Assistant')}
      width="800px"
      responsive
    >
      <DialogContent>
        {chartDataKeys.length === 0 ? (
          <EmptyState>{t('No chart data available. Please wait for charts to load.')}</EmptyState>
        ) : (
          <ChatContainer>
            <MessagesContainer>
              {messages.length === 0 && (
                <EmptyState>
                  {t('Ask me questions about your dashboard data. I can help you analyze and understand the charts.')}
                </EmptyState>
              )}
              {messages.map((message, index) => (
                <MessageBubble key={index} isUser={message.role === 'user'}>
                  {message.content}
                </MessageBubble>
              ))}
              {isLoading && (
                <LoadingIndicator>{t('Thinking...')}</LoadingIndicator>
              )}
              <div ref={messagesEndRef} />
            </MessagesContainer>
            <InputContainer>
              <Input.TextArea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={t('Type your question about the dashboard...')}
                rows={2}
                disabled={isLoading}
                style={{
                  flex: 1,
                  resize: 'none',
                }}
              />
              <Button
                buttonStyle="primary"
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading}
              >
                {t('Send')}
              </Button>
            </InputContainer>
          </ChatContainer>
        )}
      </DialogContent>
    </Modal>
  );
};

export default ChartDataDialog;
