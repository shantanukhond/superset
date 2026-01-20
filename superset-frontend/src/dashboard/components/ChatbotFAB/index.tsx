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
import { FC } from 'react';
import { css, useTheme } from '@superset-ui/core';
import styled from '@emotion/styled';
import { CommentOutlined } from '@ant-design/icons';

interface ChatbotFABProps {
  onClick: () => void;
}

const FabButton = styled.button`
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-color: ${({ theme }) => theme.colors.primary.base};
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  transition: all 0.3s ease;

  &:hover {
    background-color: ${({ theme }) => theme.colors.primary.dark1};
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  .anticon {
    font-size: 24px;
  }
`;

const ChatbotFAB: FC<ChatbotFABProps> = ({ onClick }) => {
  const theme = useTheme();

  return (
    <FabButton onClick={onClick} aria-label="Open chatbot dialog">
      <CommentOutlined />
    </FabButton>
  );
};

export default ChatbotFAB;
