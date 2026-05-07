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
import { css, styled } from '@apache-superset/core/theme';
import { t } from '@apache-superset/core/translation';
import { Icons, Popover, Progress, Typography } from '@superset-ui/core/components';
import {
  AUTH_DB_PASSWORD_MIN_LENGTH,
  getAuthDbPasswordPolicyChecks,
} from 'src/utils/generateAuthDbPassword';

interface AuthDbPasswordPolicyIndicatorProps {
  password: string;
}

const StrengthWrapper = styled.div`
  ${({ theme }) => css`
    display: flex;
    align-items: center;
    gap: ${theme.sizeUnit * 2}px;
  `}
`;

const StrengthBarContainer = styled.div`
  ${({ theme }) => css`
    flex: 1;
    cursor: help;

    .ant-progress {
      margin-bottom: 0;
    }
  `}
`;

const Checklist = styled.div`
  ${({ theme }) => css`
    min-width: ${theme.sizeUnit * 70}px;
    display: flex;
    flex-direction: column;
    gap: ${theme.sizeUnit}px;
  `}
`;

const ChecklistItem = styled.div`
  ${({ theme }) => css`
    display: flex;
    align-items: center;
    gap: ${theme.sizeUnit * 2}px;
    font-size: ${theme.fontSize}px;
  `}
`;

const requirementText = {
  minLength: t('At least %s characters', AUTH_DB_PASSWORD_MIN_LENGTH),
  uppercase: t('Contains an uppercase letter'),
  lowercase: t('Contains a lowercase letter'),
  digit: t('Contains a digit'),
  special: t('Contains a special character'),
  commonPassword: t('Is not a common password'),
};

function getStrengthState(passedChecks: number) {
  if (passedChecks <= 2) {
    return { color: '#cf1322', label: t('Very weak') };
  }
  if (passedChecks === 3) {
    return { color: '#d46b08', label: t('Weak') };
  }
  if (passedChecks === 4) {
    return { color: '#d4b106', label: t('Medium') };
  }
  if (passedChecks === 5) {
    return { color: '#389e0d', label: t('Strong') };
  }
  return { color: '#08979c', label: t('Very strong') };
}

export default function AuthDbPasswordPolicyIndicator({
  password,
}: AuthDbPasswordPolicyIndicatorProps) {
  const checks = getAuthDbPasswordPolicyChecks(password);
  const hasPassword = password.length > 0;
  const checklist = [
    { label: requirementText.minLength, passed: hasPassword && checks.minLength },
    { label: requirementText.uppercase, passed: hasPassword && checks.uppercase },
    { label: requirementText.lowercase, passed: hasPassword && checks.lowercase },
    { label: requirementText.digit, passed: hasPassword && checks.digit },
    { label: requirementText.special, passed: hasPassword && checks.special },
    {
      label: requirementText.commonPassword,
      passed: hasPassword && checks.commonPassword,
    },
  ];
  const passedChecks = checklist.filter(item => item.passed).length;
  const percent = Math.round((passedChecks / checklist.length) * 100);
  const strength = getStrengthState(passedChecks);

  return (
    <StrengthWrapper>
      <Popover
        trigger="hover"
        placement="topLeft"
        content={
          <Checklist>
            {checklist.map(item => (
              <ChecklistItem key={item.label}>
                {item.passed ? (
                  <Icons.CheckCircleFilled iconColor="success" iconSize="m" />
                ) : (
                  <Icons.CloseCircleOutlined iconColor="danger" iconSize="m" />
                )}
                <Typography.Text>{item.label}</Typography.Text>
              </ChecklistItem>
            ))}
          </Checklist>
        }
      >
        <StrengthBarContainer>
          <Progress
            percent={percent}
            showInfo={false}
            strokeColor={strength.color}
            size="small"
          />
        </StrengthBarContainer>
      </Popover>
      <Typography.Text type="secondary">{strength.label}</Typography.Text>
    </StrengthWrapper>
  );
}
