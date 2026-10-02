/** Creator / OMR 的共享类型（服务端与客户端都要用，因此单独成文件） */

export interface OmrStatus {
  available: boolean;
  engine?: string;
  message?: string;
  /** 只读展示用：`cuda` / `cpu`。本分支不做 GPU 配置 UI。 */
  device?: string;
}

export interface OmrSuccess {
  ok: true;
  /** MusicXML 文本。不返回任何服务器绝对路径（SPEC §4.13） */
  musicXml: string;
  engine: string;
  warnings: string[];
  /** 建议的下载文件名，例如 `exercise-23-recognized.musicxml` */
  downloadName: string;
}

export interface OmrFailure {
  ok: false;
  error: string;
}

export type OmrRecognizeResult = OmrSuccess | OmrFailure;
