const CONSENT_KEY = 'lgpd_consent_v1';

export function hasConsent() {
    try {
        const raw = sessionStorage.getItem(CONSENT_KEY);
        return raw === 'granted';
    } catch { return false; }
}

export function grantConsent() {
    sessionStorage.setItem(CONSENT_KEY, 'granted');
    sessionStorage.setItem('lgpd_ts', new Date().toISOString());
}

export function revokeConsent() {
    sessionStorage.removeItem(CONSENT_KEY);
    sessionStorage.removeItem('lgpd_ts');
    sessionStorage.clear();
}

/**
 * Inicializa o modal LGPD. Retorna Promise<boolean> resolvida quando
 * o usuário aceita (true) ou fecha (false).
 */
export function initLGPDModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('lgpd-modal');
        const check = document.getElementById('lgpd-check');
        const btn   = document.getElementById('lgpd-accept');

        if (hasConsent()) {
            modal.classList.remove('show');
            return resolve(true);
        }

        modal.classList.add('show');
        check.addEventListener('change', () => { btn.disabled = !check.checked; });
        btn.addEventListener('click', () => {
            if (!check.checked) return;
            grantConsent();
            modal.classList.remove('show');
            resolve(true);
        });
    });
}