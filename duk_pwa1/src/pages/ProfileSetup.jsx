/**
 * ProfileSetup.jsx — DUK Bus Tracker PWA
 * Screen 1: Login. Email OTP or Google.
 * Shows OTP modal as a popup on the same screen after submit.
 */
import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import { register, apiFetch, setApiToken } from '../api';
import { EMAIL_DOMAINS } from '../timetable';
import { useToast, SplashContext } from '../App';
import { saveToken, saveUser, saveRefreshToken } from '../storage';
import OtpModal from '../components/OtpModal';

export default function ProfileSetup() {
  const navigate = useNavigate();
  const showToast = useToast();
  const { setSplashReady } = useContext(SplashContext);

  useEffect(() => {
    setSplashReady();
  }, [setSplashReady]);

  const [emailPrefix, setEmailPrefix] = useState('');
  const [domain, setDomain] = useState(EMAIL_DOMAINS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const domainDropRef = useRef(null);
  const [domainDropOpen, setDomainDropOpen] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (domainDropRef.current && !domainDropRef.current.contains(e.target)) setDomainDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Initialize Google Login natively
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const initGoogle = () => {
      if (!window.google?.accounts?.id) return false;

      window.google.accounts.id.initialize({
        client_id: clientId,
        use_fedcm_for_prompt: false, // Fixes unclickable button bug on Safari/iOS
        callback: async ({ credential }) => {
          try {
            const res = await apiFetch('/api/v1/auth/google', {
              method: 'POST',
              body: JSON.stringify({ credential }),
            });
            setApiToken(res.access_token);
            saveToken(res.access_token);
            if (res.refresh_token) saveRefreshToken(res.refresh_token);
            saveUser(res.user);
            import('../firebase').then(m => m.requestAndSaveFcmToken()).catch(() => { });
            navigate('/route', { replace: true });
          } catch (err) {
            showToast(err.message || 'Google Sign-In failed. Try again.', 'error');
          }
        },
      });

      // Render the official Google button immediately
      window.google.accounts.id.renderButton(
        document.getElementById('google-signin-btn'),
        {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          width: 300,
          text: 'continue_with'
        }
      );
      return true;
    };

    if (!initGoogle()) {
      // If script hasn't loaded yet, poll for it
      const interval = setInterval(() => {
        if (initGoogle()) clearInterval(interval);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [navigate, showToast]);

  // Validation
  const prefixOk = emailPrefix.trim().length > 0 && !/[^a-zA-Z0-9._-]/.test(emailPrefix.trim());
  const emailErr = emailPrefix.length > 0 && !prefixOk;
  const formOk = prefixOk;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formOk || submitting) return;
    setSubmitting(true);
    const email = `${emailPrefix.trim()}${domain}`;
    try {
      await register('', email, null);
      setOtpOpen(true);
    } catch (err) {
      showToast(err.message || 'Registration failed. Try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="setup-screen">
      <div className="setup-logo-wrap">
        <img
          src="./duk-logo.png"
          alt="Digital University Kerala"
          className="setup-duk-logo"
          onError={e => { e.target.style.display = 'none'; }}
        />
      </div>

      <form className="setup-card" onSubmit={handleSubmit} noValidate>
        <div className="setup-card__header">
          <h1 className="setup-card__title" style={{ textAlign: 'center' }}>Login</h1>
        </div>

        <div className="setup-field">
          <div className={`setup-email-row${emailErr ? ' setup-input--error' : ''}`}>
            <input
              id="email-prefix"
              className="setup-input setup-input--email"
              type="text"
              placeholder="University Email"
              value={emailPrefix}
              onChange={e => setEmailPrefix(e.target.value)}
              autoCapitalize="none"
              autoComplete="username"
              inputMode="email"
            />
            <div className="setup-domain-dropdown" ref={domainDropRef}>
              <button
                type="button"
                className={`setup-domain-btn${domainDropOpen ? ' setup-domain-btn--open' : ''}`}
                onClick={() => setDomainDropOpen(o => !o)}
                aria-haspopup="listbox"
                aria-expanded={domainDropOpen}
              >
                <span>{domain}</span>
                <span className="setup-domain-chevron">
                  {domainDropOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </span>
              </button>

              {domainDropOpen && (
                <ul className="setup-domain-list" role="listbox">
                  {EMAIL_DOMAINS.map(d => (
                    <li
                      key={d}
                      role="option"
                      aria-selected={domain === d}
                      className={`setup-domain-item${domain === d ? ' setup-domain-item--active' : ''}`}
                      onClick={() => { setDomain(d); setDomainDropOpen(false); }}
                    >
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {emailErr && (
            <span className="setup-error">Only letters, numbers, dots, underscores and hyphens.</span>
          )}
        </div>

        <button
          type="submit"
          id="continue-btn"
          className="setup-submit-btn"
          disabled={!formOk || submitting}
        >
          {submitting
            ? 'Sending...'
            : <><span >Send Verification Code</span><ChevronRight size={16} /></>
          }
        </button>

      </form>

      <div style={{ width: '100%', maxWidth: '400px', margin: '0 auto 16px', padding: '0 20px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1, height: '1px', background: 'rgba(0,0,0,0.1)' }} />
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>or continue with Google</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(0,0,0,0.1)' }} />
      </div>

      <div style={{ width: '100%', maxWidth: '400px', margin: '0 auto 16px', padding: '0 20px', boxSizing: 'border-box', display: 'flex', justifyContent: 'center' }}>
        {/* The official Google button will be rendered exactly here */}
        <div id="google-signin-btn" />
      </div>

      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--med-gray)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Developed by</span>
        <img src="./canlab.png" alt="CAN Lab" style={{ height: '65px', objectFit: 'contain' }} />
      </div>

      <OtpModal
        isOpen={otpOpen}
        email={`${emailPrefix.trim()}${domain}`}
        name=""
        boardingStop={null}
        onClose={() => setOtpOpen(false)}
      />
    </div>
  );
}
