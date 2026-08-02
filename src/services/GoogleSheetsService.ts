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

  private extractSheetId(url: string): string | null {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
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
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error('Failed to retrieve spreadsheet metadata. Make sure the sheet is public or you have edit permissions.');
    }
    const meta = await response.json();
    const existingSheetTitles = meta.sheets?.map((s: any) => s.properties.title) || [];
    
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
      const batchRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      });
      if (!batchRes.ok) {
        console.error('Failed to create sheets automatically:', await batchRes.json());
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

    if (typeof arg3 === 'string') {
      url = arg3;
      if (typeof arg4 === 'object') {
        globalSettings = arg4 as Partial<PerformanceSettings>;
      }
    } else {
      setlists = arg3 || [];
      url = (typeof arg4 === 'string' ? arg4 : '') || '';
      globalSettings = arg5;
    }

    const id = this.extractSheetId(url);
    if (!id) throw new Error('Invalid Sheet URL');

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
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Patches!A:Z:clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      // Write Patches
      const resPatches = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Patches!A1?valueInputOption=RAW`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [headers, ...values]
        })
      });
      if (!resPatches.ok) {
        const err = await resPatches.json();
        throw new Error(err.error?.message || 'Failed to sync Patches to Google Sheets');
      }
    }

    // 2. Save Multis to "Multis" sheet
    const multiHeaders = ['ID', 'Name', 'Slots'];
    const multiValues = multis.map(m => {
      const slotsJson = JSON.stringify(m.slots || []);
      return [m.id, m.name, slotsJson];
    });

    // Clear Multis sheet
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Multis!A:Z:clear`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    const resMultis = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Multis!A1?valueInputOption=RAW`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [multiHeaders, ...multiValues]
      })
    });
    if (!resMultis.ok) {
      const err = await resMultis.json();
      throw new Error(err.error?.message || 'Failed to sync Multis to Google Sheets');
    }

    // 3. Save Setlists to "Setlists" sheet
    if (setlists && setlists.length > 0) {
      const setlistHeaders = ['ID', 'Name', 'Songs'];
      const setlistValues = setlists.map(s => {
        const songsJson = JSON.stringify(s.songs || []);
        return [s.id, s.name, songsJson];
      });

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Setlists!A:Z:clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      const resSetlists = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Setlists!A1?valueInputOption=RAW`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [setlistHeaders, ...setlistValues]
        })
      });
      if (!resSetlists.ok) {
        const err = await resSetlists.json();
        throw new Error(err.error?.message || 'Failed to sync Setlists to Google Sheets');
      }
    }

    // 4. Save Settings to "Settings" sheet
    if (globalSettings) {
      const settingHeaders = ['Key', 'Value'];
      const settingRows: string[][] = [
        ['songPlayPauseCc', globalSettings.songPlayPauseCc !== undefined && globalSettings.songPlayPauseCc !== null ? String(globalSettings.songPlayPauseCc) : ''],
        ['songPlayPauseChannel', globalSettings.songPlayPauseChannel !== undefined && globalSettings.songPlayPauseChannel !== null ? String(globalSettings.songPlayPauseChannel) : ''],
        ['enableSurround51', globalSettings.enableSurround51 !== undefined ? String(globalSettings.enableSurround51) : ''],
      ];

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Settings!A:Z:clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Settings!A1?valueInputOption=RAW`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [settingHeaders, ...settingRows]
        })
      });
    }
  }

  async loadFromSheet(url: string): Promise<{ patches: Patch[], multis: Multi[], setlists: Setlist[], settings?: Partial<PerformanceSettings> }> {
    const id = this.extractSheetId(url);
    if (!id) throw new Error('Invalid Sheet URL');

    const token = await this.signIn();
    await this.ensureSheetsExist(id, token);

    // Try reading Patches
    let patches: Patch[] = [];
    const patchesResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Patches!A1:Z`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    let patchesData = patchesResponse.ok ? await patchesResponse.json() : null;
    let patchRows = patchesData?.values;
    let patchHeaders = patchRows?.[0];

    // Fallback to Sheet1 if Patches is empty/missing
    if (!patchRows || patchRows.length < 2) {
      const fallbackResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Sheet1!A1:Z`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        if (fallbackData.values && fallbackData.values.length >= 2) {
          patchRows = fallbackData.values;
          patchHeaders = fallbackData.values[0];
        }
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
    const multisResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Multis!A1:Z`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (multisResponse.ok) {
      const multisData = await multisResponse.json();
      if (multisData.values && multisData.values.length >= 2) {
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
    }

    // Load Setlists
    let setlists: Setlist[] = [];
    const setlistsResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Setlists!A1:Z`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (setlistsResponse.ok) {
      const setlistsData = await setlistsResponse.json();
      if (setlistsData.values && setlistsData.values.length >= 2) {
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
    }

    // Load Settings
    const parsedSettings: Partial<PerformanceSettings> = {};
    try {
      const settingsResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Settings!A1:Z`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (settingsResponse.ok) {
        const settingsData = await settingsResponse.json();
        if (settingsData.values && settingsData.values.length >= 2) {
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
      }
    } catch (e) {
      console.warn('Failed to parse Settings sheet', e);
    }

    return { patches, multis, setlists, settings: parsedSettings };
  }
}

export const googleSheetsService = new GoogleSheetsService();

