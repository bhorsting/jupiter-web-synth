import { googleSheetsService } from './GoogleSheetsService';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

export class GoogleDriveService {
  /**
   * Save or Update a MIDI or Soundfont file directly to Google Drive
   */
  async uploadFileToDrive(
    fileName: string,
    arrayBuffer: ArrayBuffer,
    folderId?: string,
    mimeType: string = 'audio/midi'
  ): Promise<{ success: boolean; fileId?: string; message: string }> {
    const token = googleSheetsService.getAccessToken();
    if (!token) {
      return {
        success: false,
        message: 'Google Drive is not connected. Connect Google Drive in Settings to auto-sync files to Drive.'
      };
    }

    try {
      // 1. Search if file already exists in Drive (or specific folder)
      let existingFileId: string | null = null;
      let query = `name = '${fileName.replace(/'/g, "\\'")}' and trashed = false`;
      if (folderId) {
        query += ` and '${folderId}' in parents`;
      }

      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
          existingFileId = searchData.files[0].id;
        }
      }

      // 2. Prepare multipart upload payload
      const metadata: any = {
        name: fileName,
        mimeType,
      };

      if (!existingFileId && folderId) {
        metadata.parents = [folderId];
      }

      const boundary = '-------314159265358979323846';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";

      // Convert ArrayBuffer to base64
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = '';
      const len = uint8.byteLength;
      // Process in chunks to avoid stack overflow for large files
      const chunkSize = 8192;
      for (let i = 0; i < len; i += chunkSize) {
        const chunk = uint8.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk as any);
      }
      const base64Data = btoa(binary);

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType}\r\n` +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        base64Data +
        close_delim;

      let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      let method = 'POST';

      if (existingFileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`;
        method = 'PATCH';
      }

      const uploadRes = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`
        },
        body: multipartRequestBody
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        console.error('[GoogleDriveService] Upload failed:', errText);
        return { success: false, message: `Drive Upload Failed: ${uploadRes.statusText}` };
      }

      const result = await uploadRes.json();
      return {
        success: true,
        fileId: result.id,
        message: existingFileId ? 'Updated file in Google Drive' : 'Created new file in Google Drive'
      };
    } catch (err: any) {
      console.error('[GoogleDriveService] Upload error:', err);
      return { success: false, message: err.message || 'Google Drive upload error' };
    }
  }

  /**
   * Download a MIDI file from Google Drive by file ID
   */
  async downloadFileFromDrive(fileId: string): Promise<ArrayBuffer | null> {
    const token = googleSheetsService.getAccessToken();
    if (!token) return null;

    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return null;
      return await res.arrayBuffer();
    } catch (err) {
      console.error('[GoogleDriveService] Download error:', err);
      return null;
    }
  }

  /**
   * List MIDI and Audio files (such as CLICK_*.wav, SOUND_*.wav) available in Google Drive
   */
  async listAudioAndMidiFiles(folderId?: string): Promise<DriveFileItem[]> {
    const token = googleSheetsService.getAccessToken();
    if (!token) return [];

    try {
      let query = `(mimeType contains 'audio/' or name contains '.wav' or name contains '.mp3' or name contains '.mid' or name contains '.midi') and trashed = false`;
      if (folderId) {
        query += ` and '${folderId}' in parents`;
      }

      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) return [];
      const text = await res.text();
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) return [];
      const data = JSON.parse(text);
      return data.files || [];
    } catch (err) {
      console.error('[GoogleDriveService] listAudioAndMidiFiles error:', err);
      return [];
    }
  }

  /**
   * List MIDI files available in Google Drive
   */
  async listMidiFiles(folderId?: string): Promise<DriveFileItem[]> {
    const token = googleSheetsService.getAccessToken();
    if (!token) return [];

    try {
      let query = `(mimeType = 'audio/midi' or mimeType = 'audio/sp-midi' or name contains '.mid' or name contains '.midi') and trashed = false`;
      if (folderId) {
        query += ` and '${folderId}' in parents`;
      }

      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) return [];
      const text = await res.text();
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) return [];
      const data = JSON.parse(text);
      return data.files || [];
    } catch (err) {
      console.error('[GoogleDriveService] listMidiFiles error:', err);
      return [];
    }
  }
}

export const googleDriveService = new GoogleDriveService();
