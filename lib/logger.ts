/**
 * シンプルな構造化ロガー
 * エラー発生時にコピペするだけで状況がわかるように設計
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  location: string; // ファイル名:関数名
  action: string; // 何をしていたか
  message: string; // 詳細メッセージ
  context?: LogContext; // 追加のコンテキスト情報
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatLog(entry: LogEntry): string {
    // 1行で全情報を含む構造化ログ
    return JSON.stringify(entry, null, 2);
  }

  private log(level: LogLevel, location: string, action: string, message: string, context?: LogContext, error?: Error | string) {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      location,
      action,
      message,
      context,
    };

    if (error) {
      if (typeof error === 'string') {
        entry.error = {
          name: 'Error',
          message: error,
        };
      } else {
        entry.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      }
    }

    const formattedLog = this.formatLog(entry);

    switch (level) {
      case 'ERROR':
        console.error(formattedLog);
        break;
      case 'WARN':
        console.warn(formattedLog);
        break;
      case 'INFO':
        console.info(formattedLog);
        break;
      case 'DEBUG':
        console.debug(formattedLog);
        break;
    }
  }

  debug(location: string, action: string, message: string, context?: LogContext) {
    this.log('DEBUG', location, action, message, context);
  }

  info(location: string, action: string, message: string, context?: LogContext) {
    this.log('INFO', location, action, message, context);
  }

  warn(location: string, action: string, message: string, context?: LogContext, error?: Error | string) {
    this.log('WARN', location, action, message, context, error);
  }

  error(location: string, action: string, message: string, context?: LogContext, error?: Error | string) {
    this.log('ERROR', location, action, message, context, error);
  }
}

// シングルトンインスタンス
export const logger = new Logger();
