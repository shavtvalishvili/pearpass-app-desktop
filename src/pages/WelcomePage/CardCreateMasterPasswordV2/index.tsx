import React, { useState, useRef } from 'react'

import { useForm } from 'pear-apps-lib-ui-react-hooks'
import { Validator } from 'pear-apps-utils-validator'
// @ts-ignore - JS module re-export
import { TERMS_OF_USE } from 'pearpass-lib-constants'
import { useUserData } from 'pearpass-lib-vault'
import {
  stringToBuffer,
  clearBuffer
} from 'pearpass-lib-vault/src/utils/buffer'
// @ts-ignore - JS module without type declarations
import { checkPasswordStrength } from 'pearpass-utils-password-check'
import { Button } from '@tetherto/pearpass-lib-ui-kit'
import {
  KeyboardArrowRightFilled,
  EyeFilled,
  EyeOutlined,
  GppMaybe,
  VerifiedUser,
  DoneAll
} from '@tetherto/pearpass-lib-ui-kit/icons'

// Icon / info — circle with "i" (not available in UI kit)
const InfoIcon = ({ width = 16, height = 16, color = '#f6f6f6' }: { width?: number; height?: number; color?: string }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill={color} />
  </svg>
)

// Icon / report_problem — warning triangle with "!" (not available in UI kit)
const ReportProblemIcon = ({ width = 16, height = 16, color = '#f6f6f6' }: { width?: number; height?: number; color?: string }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none">
    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill={color} />
  </svg>
)

import { styles, colors as C } from './styles'
import { LOCAL_STORAGE_KEYS } from '../../../constants/localStorage'
import { useGlobalLoading } from '../../../context/LoadingContext'
import { useRouter } from '../../../context/RouterContext'
import { useTranslation } from '../../../hooks/useTranslation'
import { logger } from '../../../utils/logger'

type IndicatorType = 'vulnerable' | 'decent' | 'strong' | 'match'

const STRENGTH_MAP: Record<string, IndicatorType> = {
  error: 'vulnerable',
  warning: 'decent',
  success: 'strong'
}

const INDICATOR_CONFIG: Record<IndicatorType, { label: string; color: string; Icon: React.FC<any> }> = {
  vulnerable: { label: 'Vulnerable', color: '#d13b3d', Icon: GppMaybe },
  decent: { label: 'Decent', color: C.semanticWarning, Icon: GppMaybe },
  strong: { label: 'Strong', color: C.semanticSuccess, Icon: VerifiedUser },
  match: { label: 'Match', color: C.textAccent, Icon: DoneAll }
}

// Custom password input matching Figma "Single Item Input"
const PasswordInput = ({
  label,
  placeholder,
  value,
  onChange,
  indicator,
  testID
}: {
  label: string
  placeholder: string
  value: string
  onChange: (val: string) => void
  indicator?: IndicatorType
  testID?: string
}) => {
  const [focused, setFocused] = useState(false)
  const [visible, setVisible] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const fieldStyle = focused ? styles.inputFieldFocused : styles.inputField
  const indicatorCfg = indicator ? INDICATOR_CONFIG[indicator] : null

  return (
    <div
      style={fieldStyle}
      onClick={() => inputRef.current?.focus()}
      data-testid={testID}
    >
      <div style={styles.inputContent}>
        <span style={styles.inputLabel}>{label}</span>
        <input
          ref={inputRef}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          style={value ? styles.inputValue : styles.inputPlaceholder}
          autoComplete="off"
        />
      </div>
      <div style={styles.rightSlot}>
        {indicatorCfg && (
          <>
            <div style={styles.indicator}>
              <div style={styles.indicatorIcon}>
                <indicatorCfg.Icon width={12} height={12} color={indicatorCfg.color} />
              </div>
              <span style={{ ...styles.indicatorText, color: indicatorCfg.color }}>
                {indicatorCfg.label}
              </span>
            </div>
            <div style={styles.divider} />
          </>
        )}
        <button
          type="button"
          style={styles.eyeButton}
          onClick={(e) => {
            e.stopPropagation()
            setVisible(!visible)
          }}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible
            ? <EyeFilled width={16} height={16} />
            : <EyeOutlined width={16} height={16} />
          }
        </button>
      </div>
    </div>
  )
}

export const CardCreateMasterPasswordV2 = () => {
  const { t } = useTranslation()
  const { currentPage, navigate } = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  useGlobalLoading({ isLoading })

  const { createMasterPassword } = useUserData()

  const schema = Validator.object({
    password: Validator.string().required(t('Password is required')),
    passwordConfirm: Validator.string().required(t('Password is required'))
  })

  const { register, handleSubmit, setErrors, setValue, values } = useForm({
    initialValues: {
      password: '',
      passwordConfirm: ''
    },
    validate: (formValues: { password: string; passwordConfirm: string }) =>
      schema.validate(formValues)
  })

  const passwordStrength = values.password
    ? checkPasswordStrength(values.password)
    : null

  const isPasswordStrong = passwordStrength?.strengthType === 'success'
  const passwordsMatch =
    isPasswordStrong &&
    values.password.length > 0 &&
    values.password === values.passwordConfirm
  const isFormValid = isPasswordStrong && passwordsMatch

  const passwordIndicator: IndicatorType | undefined = passwordStrength
    ? STRENGTH_MAP[passwordStrength.strengthType]
    : undefined

  const handlePasswordChange = (val: string) => {
    register('password').onChange(val)
    if (!val) {
      setErrors({})
    }
  }

  const handleConfirmChange = (val: string) => {
    register('passwordConfirm').onChange(val)
  }

  const onSubmit = async (formValues: {
    password: string
    passwordConfirm: string
  }) => {
    if (isLoading) return

    const strength = checkPasswordStrength(formValues.password)
    if (strength.strengthType !== 'success') {
      setErrors({
        password: strength.errors?.[0] || t('Password is not strong enough')
      })
      setValue('passwordConfirm', '')
      return
    }

    if (formValues.password !== formValues.passwordConfirm) {
      setErrors({ passwordConfirm: t('Passwords do not match') })
      return
    }

    const passwordBuffer = stringToBuffer(formValues.password)
    try {
      setIsLoading(true)
      localStorage.setItem(LOCAL_STORAGE_KEYS.TOU_ACCEPTED, 'true')
      await createMasterPassword(passwordBuffer)
      navigate(currentPage, { state: 'masterPassword' })
      setIsLoading(false)
    } catch (error) {
      setIsLoading(false)
      setErrors({ password: t('Error creating master password') })
      logger.error(
        'CardCreateMasterPasswordV2',
        'Error creating master password:',
        error
      )
    } finally {
      clearBuffer(passwordBuffer)
    }
  }

  const handleLoadVaultClick = () => {
    navigate(currentPage, { state: 'loadVault' })
  }

  const showInfoToast = values.password && !isPasswordStrong

  return (
    <div style={styles.card}>
      <form onSubmit={handleSubmit(onSubmit)} style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>{t('Create Master Password')}</h2>
          <p style={styles.subtitle}>
            <span>{t('Create a Master Password, or ')}</span>
            <span style={styles.subtitleLink} onClick={handleLoadVaultClick}>
              {t('continue with existing PearPass')}
            </span>
          </p>
        </div>

        {/* Fields */}
        <div style={styles.fieldsWrapper}>
          {/* Password field + toast */}
          <div style={styles.passwordWrapper}>
            <PasswordInput
              label={t('Password')}
              placeholder={t('Enter Master Password')}
              value={values.password}
              onChange={handlePasswordChange}
              indicator={passwordIndicator}
              testID="master-password-field"
            />
            {showInfoToast && (
              <div style={styles.toast}>
                <div style={styles.toastIcon}>
                  <InfoIcon width={16} height={16} />
                </div>
                <span style={styles.toastText}>
                  {t(
                    'Strong passwords are usually at least 8 characters long, hard to guess, use a mix of letters, numbers, and symbols, and aren\'t based on personal information.'
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Repeat password field */}
          <PasswordInput
            label={t('Repeat Password')}
            placeholder={t('Repeat Master Password')}
            value={values.passwordConfirm}
            onChange={handleConfirmChange}
            indicator={passwordsMatch ? 'match' : undefined}
            testID="confirm-password-field"
          />

          {/* Alert message */}
          {isFormValid && (
            <div style={styles.alertWrapper}>
              <div style={styles.alertIcon}>
                <ReportProblemIcon width={16} height={16} color="#d7d245" />
              </div>
              <span style={styles.alertText}>
                {t(
                  "Don't forget your Master password. It's the only way to access your vault. We can't help recover it. Back it up securely."
                )}
              </span>
            </div>
          )}
        </div>

        {/* Footer row */}
        <div style={styles.footerRow}>
          <div style={styles.touText}>
            <span>{t('By clicking Continue, you confirm that you have read and agree to the ')}</span>
            <a
              style={styles.touLink}
              href={TERMS_OF_USE}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('PearPass Application Terms of Use')}
            </a>
            <span>.</span>
          </div>
          <Button
            variant="primary"
            size="small"
            disabled={!isFormValid}
            isLoading={isLoading}
            onClick={() => handleSubmit(onSubmit)()}
            iconAfter={<KeyboardArrowRightFilled width={16} height={16} />}
          >
            {t('Continue')}
          </Button>
        </div>
      </form>
    </div>
  )
}
