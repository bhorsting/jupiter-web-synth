import { Patch, Multi, Setlist, PerformanceSettings, cleanVoiceParams } from '../types';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly';

console.log('[GoogleSheetsService] Client ID configured:', !!CLIENT_ID);

export interface SheetConfig {
  url: string;
  id: string;
}

class GoogleSheetsService {
  private accessToken: string | null = null;

  constructor() {}

  getAccessToken(): string | null {
    return this.accessToken;
  }

  public extractSheetId(url: string): string | null {
    if (!url) return null;
    const trimmed = url.trim();

    // Catch users pasting "Publish to web" URLs which are not standard Google Sheets API spreadsheets
    if (trimmed.includes('/pubhtml') || trimmed.includes('/pub?') || trimmed.includes('/spreadsheets/d/e/')) {
      throw new Error(
        'You provided a "Publish to the web" URL. Please use the standard Google Sheet URL from your browser address bar (e.g., https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit).'
      );
    }

    // Direct Sheet ID (standard 25 to 70 character base64/uuid alphanumeric string)
    if (/^[a-zA-Z0-9-_]{25,70}$/.test(trimmed)) {
      return trimmed;
    }

    // Standard docs.google.com/spreadsheets/d/{ID} or /u/0/d/{ID}
    const match = trimmed.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/([a-zA-Z0-9-_]{25,70})/);
    return match ? match[1] : null;
  }

  /**
   * Safe JSON fetcher that cleanly intercepts HTML error pages (e.g. <!DOCTYPE, <html>)
   * preventing "SyntaxError: Unexpected token '<', '<!DOCTYPE '... is not valid JSON"
   */
  private async safeFetchJson<T = any>(
    url: string,
    options: RequestInit = {},
    contextMsg: string = 'Google Sheets request'
  ): Promise<T> {
    const res = await fetch(url, options);

    // If redirected to Google login or accounts page, session is expired
    if (res.redirected || (res.url && res.url.includes('accounts.google.com'))) {
      this.accessToken = null;
      throw new Error(`Google authorization expired. Please click 'Reconnect' in Settings or Library.`);
    }

    const text = await res.text();
    const trimmed = text.trim();

    // Check for HTML responses (Google error pages, 404s, OAuth redirects)
    if (
      trimmed.startsWith('<!DOCTYPE') ||
      trimmed.startsWith('<!doctype') ||
      trimmed.startsWith('<html') ||
      trimmed.startsWith('<head') ||
      trimmed.includes('<!--DOCTYPE') ||
      trimmed.includes('<!DOCTYPE')
    ) {
      if (res.status === 401) {
        this.accessToken = null;
        throw new Error('Google authorization token expired (HTTP 401). Please click "Reconnect" in Library or Settings.');
      }
      if (res.status === 403) {
        throw new Error('Permission denied by Google Sheets (HTTP 403). Make sure your Google account has Editor access to this spreadsheet.');
      }
      if (res.status === 404) {
        throw new Error('Spreadsheet or sheet tab not found (HTTP 404). Please verify your Google Sheet URL.');
      }
      throw new Error(`Received HTML error page instead of JSON (${contextMsg}, HTTP ${res.status}). Please check your Google Sheet URL and reconnect authorization.`);
    }

    if (!res.ok) {
      try {
        const json = JSON.parse(text);
        if (json.error?.message) throw new Error(json.error.message);
        if (json.message) throw new Error(json.message);
      } catch (parseErr: any) {
        if (parseErr.message && !parseErr.message.includes('JSON')) {
          throw parseErr;
        }
      }
      throw new Error(`${contextMsg} failed (HTTP ${res.status}: ${res.statusText || 'Error'})`);
    }

    if (!text || text.trim().length === 0) {
      return {} as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch (parseErr: any) {
      throw new Error(`Failed to parse Google Sheets response for ${contextMsg}: ${parseErr.message}`);
    }
  }

  private async getErrorMessage(res: Response, defaultMsg: string): Promise<string> {
    try {
      const text = await res.text();
      const trimmed = text.trim();
      if (
        trimmed.startsWith('<!DOCTYPE') ||
        trimmed.startsWith('<!doctype') ||
        trimmed.startsWith('<html') ||
        trimmed.includes('<!DOCTYPE')
      ) {
        if (res.status === 401) return 'Google authentication expired or invalid. Please reconnect in Settings.';
        if (res.status === 403) return 'Permission denied. Please ensure your Google account has editor access to the spreadsheet.';
        if (res.status === 404) return 'Spreadsheet or sheet tab not found. Please verify the Google Sheet URL.';
        return `${defaultMsg} (HTTP ${res.status}: ${res.statusText || 'Error'})`;
      }
      try {
        const json = JSON.parse(text);
        if (json.error?.message) return json.error.message;
        if (json.message) return json.message;
      } catch {
        if (text && text.trim().length > 0 && text.length < 200) {
          return text.trim();
        }
      }
    } catch {
      // Fall through
    }
    return `${defaultMsg} (HTTP ${res.status}: ${res.statusText || 'Request failed'})`;
  }

  isConnected(): boolean {
    return !!this.accessToken;
  }

  async signIn(): Promise<string> {
    if (this.accessToken) return this.accessToken;

    return new Promise((resolve, reject) => {
      if (!CLIENT_ID) {
        reject(new Error('VITE_GOOGLE_CLIENT_ID is not configured in secrets.'));
        return;
      }

      try {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (response: any) => {
            console.log('[GoogleSheetsService] OAuth Response:', response);
            if (response.error) {
              reject(new Error(response.error_description || response.error || 'Authentication failed'));
            } else {
              this.accessToken = response.access_token;
              // Set a timeout to clear token before it expires (usually 1 hour)
              setTimeout(() => { this.accessToken = null; }, (response.expires_in - 60) * 1000);
              resolve(response.access_token);
            }
          },
          error_callback: (err: any) => {
            console.error('[GoogleSheetsService] OAuth Error Callback:', err);
            reject(new Error(err.message || 'OAuth interaction failed. Check if popups are blocked.'));
          }
        });
        
        // Use a small delay to ensure the browser registers this as a direct user action if called from another async flow
        client.requestAccessToken({ prompt: '' });
      } catch (error: any) {
        console.error('[GoogleSheetsService] OAuth Init Error:', error);
        reject(error);
      }
    });
  }

  async ensureSheetsExist(id: string, token: string): Promise<void> {
    let meta: any;
    try {
      meta = await this.safeFetchJson(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}`,
        { headers: { Authorization: `Bearer ${token}` } },
        'fetch spreadsheet structure'
      );
    } catch (err: any) {
      throw new Error(`Cannot access spreadsheet: ${err.message}`);
    }

    const existingSheetTitles: string[] = meta?.sheets?.map((s: any) => s.properties?.title) || [];
    
    const requests: any[] = [];
    if (!existingSheetTitles.includes('Patches')) {
      requests.push({
        addSheet: { properties: { title: 'Patches' } }
      });
    }
    if (!existingSheetTitles.includes('Multis')) {
      requests.push({
        addSheet: { properties: { title: 'Multis' } }
      });
    }
    if (!existingSheetTitles.includes('Setlists')) {
      requests.push({
        addSheet: { properties: { title: 'Setlists' } }
      });
    }
    if (!existingSheetTitles.includes('Settings')) {
      requests.push({
        addSheet: { properties: { title: 'Settings' } }
      });
    }
    
    if (requests.length > 0) {
      try {
        await this.safeFetchJson(
          `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ requests })
          },
          'create required sheet tabs'
        );
      } catch (err: any) {
        console.warn('Failed to auto-create sheet tabs:', err);
      }
    }
  }

  async saveToSheet(
    patches: Patch[],
    multis: Multi[],
    arg3: string | Setlist[],
    arg4?: string | Partial<PerformanceSettings>,
    arg5?: Partial<PerformanceSettings>
  ): Promise<void> {
    let url: string;
    let setlists: Setlist[] = [];
    let globalSettings: Partial<PerformanceSettings> | undefined;
    let hasSetlistsArg = false;

    if (typeof arg3 === 'string') {
      url = arg3;
      if (typeof arg4 === 'object') {
        globalSettings = arg4 as Partial<PerformanceSettings>;
      }
    } else {
      hasSetlistsArg = true;
      setlists = arg3 || [];
      url = (typeof arg4 === 'string' ? arg4 : '') || '';
      globalSettings = arg5;
    }

    const id = this.extractSheetId(url);
    if (!id) {
      throw new Error('Invalid Sheet URL. Please check the Google Sheet link in Settings.');
    }

    const token = await this.signIn();
    await this.ensureSheetsExist(id, token);

    // 1. Save Patches to "Patches" sheet
    if (patches.length > 0) {
      const paramKeys = Object.keys(patches[0].params).sort();
      const headers = ['ID', 'Name', 'MIDIMappings', ...paramKeys];

      const values = patches.map(p => {
        const midiMappingsJson = JSON.stringify(p.midiMappings || []);
        return [
          p.id,
          p.name,
          midiMappingsJson,
          ...paramKeys.map(key => {
            const val = p.params[key as keyof typeof p.params];
            if (val === undefined || val === null) return '';
            if (typeof val === 'object') return JSON.stringify(val);
            return val;
          })
        ];
      });

      // Clear Patches sheet
      try {
        await this.safeFetchJson(
          `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Patches!A:Z:clear`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          },
          'clear Patches sheet'
        );
      } catch (e) {
        console.warn('Clear Patches sheet warning:', e);
      }

      // Write Patches
      await this.safeFetchJson(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Patches!A1?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [headers, ...values]
          })
        },
        'write Patches'
      );
    }

    // 2. Save Multis to "Multis" sheet
    const multiHeaders = ['ID', 'Name', 'Slots'];
    const multiValues = multis.map(m => {
      const slotsJson = JSON.stringify(m.slots || []);
      return [m.id, m.name, slotsJson];
    });

    // Clear Multis sheet
    try {
      await this.safeFetchJson(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Multis!A:Z:clear`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        },
        'clear Multis sheet'
      );
    } catch (e) {
      console.warn('Clear Multis sheet warning:', e);
    }

    await this.safeFetchJson(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Multis!A1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [multiHeaders, ...multiValues]
        })
      },
      'write Multis'
    );

    // 3. Save Setlists to "Setlists" sheet
    if (hasSetlistsArg) {
      const setlistHeaders = ['ID', 'Name', 'Songs'];
      const setlistValues = (setlists || []).map(s => {
        const songsJson = JSON.stringify(s.songs || []);
        return [s.id, s.name, songsJson];
      });

      try {
        await this.safeFetchJson(
          `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Setlists!A:Z:clear`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          },
          'clear Setlists sheet'
        );
      } catch (e) {
        console.warn('Clear Setlists sheet warning:', e);
      }

      await this.safeFetchJson(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Setlists!A1?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [setlistHeaders, ...setlistValues]
          })
        },
        'write Setlists'
      );
    }

    // 4. Save Settings to "Settings" sheet
    if (globalSettings) {
      const settingHeaders = ['Key', 'Value'];
      const settingRows: string[][] = [
        ['songPlayPauseCc', globalSettings.songPlayPauseCc !== undefined && globalSettings.songPlayPauseCc !== null ? String(globalSettings.songPlayPauseCc) : ''],
        ['songPlayPauseChannel', globalSettings.songPlayPauseChannel !== undefined && globalSettings.songPlayPauseChannel !== null ? String(globalSettings.songPlayPauseChannel) : ''],
        ['enableSurround51', globalSettings.enableSurround51 !== undefined ? String(globalSettings.enableSurround51) : ''],
      ];

      try {
        await this.safeFetchJson(
          `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Settings!A:Z:clear`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          },
          'clear Settings sheet'
        );
      } catch (e) {
        console.warn('Clear Settings sheet warning:', e);
      }

      await this.safeFetchJson(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Settings!A1?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [settingHeaders, ...settingRows]
          })
        },
        'write Settings'
      );
    }
  }

  async loadFromSheet(url: string): Promise<{ patches: Patch[], multis: Multi[], setlists: Setlist[], settings?: Partial<PerformanceSettings> }> {
    const id = this.extractSheetId(url);
    if (!id) {
      throw new Error('Invalid Sheet URL. Please check the Google Sheet link in Settings.');
    }

    const token = await this.signIn();
    await this.ensureSheetsExist(id, token);

    // Try reading Patches
    let patches: Patch[] = [];
    let patchesData: any = null;
    try {
      patchesData = await this.safeFetchJson(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Patches!A1:Z`,
        { headers: { Authorization: `Bearer ${token}` } },
        'read Patches'
      );
    } catch (e) {
      console.warn('Failed to read Patches tab:', e);
    }

    let patchRows = patchesData?.values;
    let patchHeaders = patchRows?.[0];

    // Fallback to Sheet1 if Patches is empty/missing
    if (!patchRows || patchRows.length < 2) {
      try {
        const fallbackData = await this.safeFetchJson(
          `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Sheet1!A1:Z`,
          { headers: { Authorization: `Bearer ${token}` } },
          'read Sheet1 fallback'
        );
        if (fallbackData?.values && fallbackData.values.length >= 2) {
          patchRows = fallbackData.values;
          patchHeaders = fallbackData.values[0];
        }
      } catch (e) {
        console.warn('Failed to read Sheet1 fallback:', e);
      }
    }

    if (patchRows && patchRows.length >= 2) {
      const rows = patchRows.slice(1);
      // Determine if ID column is present (we added it, but older Sheet1 might not have it)
      const hasIdCol = patchHeaders[0].toLowerCase() === 'id';
      const nameColIndex = hasIdCol ? 1 : 0;
      const mappingsColIndex = hasIdCol ? 2 : 1;
      const paramsStartColIndex = hasIdCol ? 3 : 2;

      patches = rows.map((row: any[], index: number) => {
        const patchId = hasIdCol ? row[0] : `google-${index}-${Date.now()}`;
        const name = row[nameColIndex] || 'Unnamed Patch';
        const midiMappingsStr = row[mappingsColIndex];
        const params: any = {};
        let midiMappings: any[] = [];

        try {
          if (midiMappingsStr) {
            midiMappings = JSON.parse(midiMappingsStr);
          }
        } catch (e) {
          console.warn('Failed to parse MIDI mappings for row', index, e);
        }

        for (let i = paramsStartColIndex; i < patchHeaders.length; i++) {
          const key = patchHeaders[i];
          const value = row[i];
          if (value === undefined || value === null || value === '') continue;

          if (value === 'true') {
            params[key] = true;
          } else if (value === 'false') {
            params[key] = false;
          } else if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
            try {
              params[key] = JSON.parse(value);
            } catch {
              params[key] = value;
            }
          } else {
            params[key] = isNaN(Number(value)) ? value : Number(value);
          }
        }

        return {
          id: patchId,
          name,
          params: cleanVoiceParams(params),
          midiMappings
        } as Patch;
      });
    }

    // Load Multis
    let multis: Multi[] = [];
    try {
      const multisData = await this.safeFetchJson(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Multis!A1:Z`,
        { headers: { Authorization: `Bearer ${token}` } },
        'read Multis'
      );

      if (multisData?.values && multisData.values.length >= 2) {
        const multiRows = multisData.values.slice(1);
        multis = multiRows.map((row: any[], index: number) => {
          const multiId = row[0];
          const name = row[1] || 'Unnamed Multi';
          const slotsStr = row[2];
          let slots: any[] = [];

          try {
            if (slotsStr) {
              slots = JSON.parse(slotsStr);
            }
          } catch (e) {
            console.warn('Failed to parse slots for multi row', index, e);
          }

          return {
            id: multiId,
            name,
            slots
          } as Multi;
        });
      }
    } catch (e) {
      console.warn('Failed to read Multis tab:', e);
    }

    // Load Setlists
    let setlists: Setlist[] = [];
    try {
      const setlistsData = await this.safeFetchJson(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Setlists!A1:Z`,
        { headers: { Authorization: `Bearer ${token}` } },
        'read Setlists'
      );

      if (setlistsData?.values && setlistsData.values.length >= 2) {
        const setlistRows = setlistsData.values.slice(1);
        setlists = setlistRows.map((row: any[], index: number) => {
          const setlistId = row[0];
          const name = row[1] || 'Unnamed Setlist';
          const songsStr = row[2];
          let songs: any[] = [];

          try {
            if (songsStr) {
              songs = JSON.parse(songsStr);
            }
          } catch (e) {
            console.warn('Failed to parse songs for setlist row', index, e);
          }

          return {
            id: setlistId,
            name,
            songs
          } as Setlist;
        });
      }
    } catch (e) {
      console.warn('Failed to read Setlists tab:', e);
    }

    // Load Settings
    const parsedSettings: Partial<PerformanceSettings> = {};
    try {
      const settingsData = await this.safeFetchJson(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Settings!A1:Z`,
        { headers: { Authorization: `Bearer ${token}` } },
        'read Settings'
      );

      if (settingsData?.values && settingsData.values.length >= 2) {
        const rows = settingsData.values.slice(1);
        rows.forEach((row: any[]) => {
          const key = row[0];
          const val = row[1];
          if (!key || val === undefined || val === '') return;
          if (key === 'songPlayPauseCc') {
            parsedSettings.songPlayPauseCc = isNaN(Number(val)) ? null : Number(val);
          } else if (key === 'songPlayPauseChannel') {
            parsedSettings.songPlayPauseChannel = isNaN(Number(val)) ? null : Number(val);
          } else if (key === 'enableSurround51') {
            parsedSettings.enableSurround51 = val === 'true';
          }
        });
      }
    } catch (e) {
      console.warn('Failed to parse Settings sheet', e);
    }

    return { patches, multis, setlists, settings: parsedSettings };
  }
}

export const googleSheetsService = new GoogleSheetsService();

