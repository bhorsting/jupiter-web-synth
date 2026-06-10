import { Patch, cleanVoiceParams } from '../types';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

console.log('[GoogleSheetsService] Client ID configured:', !!CLIENT_ID);

export interface SheetConfig {
  url: string;
  id: string;
}

class GoogleSheetsService {
  private accessToken: string | null = null;

  constructor() {}

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

  async savePatchesToSheet(patches: Patch[], url: string): Promise<void> {
    const id = this.extractSheetId(url);
    if (!id) throw new Error('Invalid Sheet URL');

    const token = await this.signIn();
    
    // Define headers based on the Patch structure
    // We'll extract all unique keys from the params to ensure we don't miss anything,
    // but typically they are consistent.
    if (patches.length === 0) return;

    const paramKeys = Object.keys(patches[0].params).sort();
    const headers = ['Name', 'MIDIMappings', ...paramKeys];

    const values = patches.map(p => {
      const midiMappingsJson = JSON.stringify(p.midiMappings || []);
      return [p.name, midiMappingsJson, ...paramKeys.map(key => p.params[key as keyof typeof p.params])];
    });
    
    // First, clear the sheet (using a wider range to be safe)
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Sheet1!A:Z:clear`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    // Then, update with new values
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Sheet1!A1?valueInputOption=RAW`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [headers, ...values]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Failed to sync to Google Sheets');
    }
  }

  async loadPatchesFromSheet(url: string): Promise<Patch[]> {
    const id = this.extractSheetId(url);
    if (!id) throw new Error('Invalid Sheet URL');

    const token = await this.signIn();
    // Read a wide range to get all potential columns
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Sheet1!A1:Z`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Failed to load from Google Sheets');
    }

    const data = await response.json();
    if (!data.values || data.values.length < 2) return [];

    const headers = data.values[0];
    const rows = data.values.slice(1);

    return rows.map((row: any[], index: number) => {
      const name = row[0];
      const midiMappingsStr = row[1];
      const params: any = {};
      let midiMappings: any[] = [];

      try {
        if (midiMappingsStr) {
          midiMappings = JSON.parse(midiMappingsStr);
        }
      } catch (e) {
        console.warn('Failed to parse MIDI mappings for row', index, e);
      }
      
      // Map columns back to params object
      for (let i = 2; i < headers.length; i++) {
        const key = headers[i];
        const value = row[i];
        // Convert string values back to numbers if needed
        params[key] = isNaN(Number(value)) ? value : Number(value);
      }

      return {
        id: `google-${index}-${Date.now()}`,
        name,
        params: cleanVoiceParams(params),
        midiMappings
      } as Patch;
    });
  }
}

export const googleSheetsService = new GoogleSheetsService();
