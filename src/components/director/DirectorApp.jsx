import { useEffect, useState } from 'react';
import { supabase } from '../../store/supabaseClient';
import DirectorLogin from './DirectorLogin';
import DirectorDashboard from './DirectorDashboard';
import RecipientDisplayNameModal from './RecipientDisplayNameModal';
import {
  getFeedbackDisplayNameChangeEventName,
  getStoredFeedbackDisplayName,
  getSuggestedFeedbackDisplayName,
  saveFeedbackDisplayName,
} from '../../utils/feedbackDisplayName';

function getLocalSession() {
  try {
    const key = Object.keys(localStorage).find(
      (storageKey) => storageKey.startsWith('sb-') && storageKey.endsWith('-auth-token')
    );
    if (!key) return null;
    const stored = JSON.parse(localStorage.getItem(key));
    const session = stored?.currentSession ?? stored;
    if (!session?.access_token) return null;
    if (session.expires_at && session.expires_at * 1000 < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export default function DirectorApp({ authUser }) {
  const [session, setSession] = useState(() => getLocalSession());
  const [displayName, setDisplayName] = useState(() => getStoredFeedbackDisplayName());
  const [displayNameModalOpen, setDisplayNameModalOpen] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return undefined;
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data?.session ?? null);
      })
      .catch(() => setSession(null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user || session?.isGuest || displayName) return;
    setDisplayNameModalOpen(true);
  }, [displayName, session]);

  useEffect(() => {
    const eventName = getFeedbackDisplayNameChangeEventName();
    const syncDisplayName = () => setDisplayName(getStoredFeedbackDisplayName());
    window.addEventListener(eventName, syncDisplayName);
    return () => window.removeEventListener(eventName, syncDisplayName);
  }, []);

  const handleBack = () => {
    window.location.hash = '';
  };

  const handleDisplayNameSave = (value) => {
    const parsed = saveFeedbackDisplayName(value);
    if (!parsed.success) return;
    setDisplayName(parsed.data);
    setDisplayNameModalOpen(false);
  };

  const GUEST_SESSION = {
    user: {
      id: 'guest',
      email: '',
      user_metadata: { full_name: '둘러보기', avatar_url: '' },
    },
    isGuest: true,
  };

  return session ? (
    <>
      <DirectorDashboard session={session} onBack={handleBack} isGuest={!!session.isGuest} />
      <RecipientDisplayNameModal
        open={displayNameModalOpen}
        allowClose={false}
        initialValue={displayName}
        suggestedValue={getSuggestedFeedbackDisplayName(session)}
        onSubmit={handleDisplayNameSave}
      />
    </>
  ) : (
    <DirectorLogin onBack={handleBack} onGuest={() => setSession(GUEST_SESSION)} />
  );
}
