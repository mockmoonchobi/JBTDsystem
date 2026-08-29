import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Database } from 'lucide-react';
import { safeStorage, idbClear } from '../utils/storageUtils';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleClearCorruptState = async () => {
    if (window.confirm('ローカルに保存された一時キャッシュをリセットして再起動しますか？（データは初期状態またはGoogleシートから再読み込みされます）')) {
      const savedSheet = safeStorage.getItem('temple_google_sheet_info');
      const lastSync = safeStorage.getItem('temple_google_sheet_last_sync');
      
      safeStorage.clear();
      await idbClear();
      
      if (savedSheet) safeStorage.setItem('temple_google_sheet_info', savedSheet);
      if (lastSync) safeStorage.setItem('temple_google_sheet_last_sync', lastSync);
      
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center p-6 font-sans">
          <div className="bg-white border-2 border-rose-400 max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center space-x-3 pb-3 border-b border-rose-200">
              <div className="p-2 bg-rose-100 text-rose-700">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 font-serif">
                  {this.props.fallbackTitle || '画面表示中に予期せぬエラーが発生しました'}
                </h1>
                <p className="text-xs text-gray-500">
                  取り込みデータ形式の不整合などを自動検知しました
                </p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 p-3 text-xs font-mono text-rose-900 overflow-x-auto max-h-32">
              {this.state.error?.message || '不明なエラー'}
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              画面を再読み込みするか、一時キャッシュをリセットして復旧してください。
            </p>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={this.handleReset}
                className="flex-1 py-2.5 px-4 bg-[#1A1A1A] hover:bg-[#333333] text-white text-xs font-bold flex items-center justify-center space-x-2 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>画面を再読み込み</span>
              </button>
              <button
                onClick={this.handleClearCorruptState}
                className="py-2.5 px-4 bg-rose-100 hover:bg-rose-200 text-rose-800 text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border border-rose-300"
              >
                <Database className="w-4 h-4" />
                <span>キャッシュ初期化復旧</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
