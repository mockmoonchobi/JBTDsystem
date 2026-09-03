import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

export interface UseVirtualScrollOptions {
  /** 全アイテム数 */
  count: number;
  /** 1アイテムあたりの推定高さ (px) */
  estimateItemHeight: number;
  /** 画面外（上下）に事前描画するアイテム数（デフォルト: 60） */
  overscan?: number;
  /** スクロールコンテナ要素の ref */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 初期フォールバックコンテナ高さ (px) (デフォルト: 600) */
  defaultContainerHeight?: number;
  /**
   * 指定件数以下の場合は仮想スクロールを行わず全件描画（デフォルト: 600）
   * 通常規模のデータではDOM全件描画の方がスクロール時の白飛び・レコード消失が100%防げます。
   */
  disableThreshold?: number;
}

export interface UseVirtualScrollReturn {
  /** レンダリング開始インデックス */
  startIndex: number;
  /** レンダリング終了インデックス（排他） */
  endIndex: number;
  /** 上部スペーサーの高さ (px) */
  topSpacerHeight: number;
  /** 下部スペーサーの高さ (px) */
  bottomSpacerHeight: number;
  /** 全アイテムの合計推定高さ (px) */
  totalHeight: number;
  /** 現在レンダリング対象のインデックス配列 */
  virtualIndices: number[];
  /** 指定インデックスへのスクロール */
  scrollToIndex: (
    index: number,
    options?: {
      align?: 'start' | 'center' | 'end' | 'auto';
      behavior?: ScrollBehavior;
    }
  ) => void;
  /** 現在スクロール中かどうか */
  isScrolling: boolean;
}

/**
 * テーブルおよび大容量リスト用の高性能仮想スクロールカスタムフック。
 * 画面に表示されている範囲（+ overscanバッファ）のみをDOMにマウントし、
 * 数千件以上のデータでも初期描画時間とDOMノード数を最小限に抑えて
 * 60fpsのスムーズなスクロールを実現します。
 */
export function useVirtualScroll({
  count,
  estimateItemHeight,
  overscan = 60,
  containerRef,
  defaultContainerHeight = 600,
  disableThreshold = 600,
}: UseVirtualScrollOptions): UseVirtualScrollReturn {
  const [scrollTop, setScrollTop] = useState<number>(0);
  const [viewportHeight, setViewportHeight] = useState<number>(defaultContainerHeight);
  const [isScrolling, setIsScrolling] = useState<boolean>(false);

  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  // コンテナのサイズ測定とResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 初回測定
    if (container.clientHeight > 0) {
      setViewportHeight(container.clientHeight);
    }
    if (container.scrollTop > 0) {
      setScrollTop(container.scrollTop);
    }

    // ResizeObserverによるコンテナサイズ追跡
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const height = entry.contentRect.height;
          if (height > 0) {
            setViewportHeight(height);
          }
        }
      });
      resizeObserver.observe(container);
    }

    // スクロールイベントハンドラー
    // 【重要】スクロールイベントごとに cancelAnimationFrame を呼ぶと、
    // 高速スクロール中にコールバックの実行が連続キャンセルされて scrollTop の更新が遅延し、
    // レコード表示が消える（白飛びする）原因になります。
    // そのため、次の描画フレーム（~16ms毎）で必ず最新の scrollTop が反映されるよう制御します。
    const handleScroll = () => {
      const el = containerRef.current;
      if (!el) return;

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          if (containerRef.current) {
            setScrollTop(containerRef.current.scrollTop);
          }
        });
      }

      setIsScrolling(true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
        if (containerRef.current) {
          setScrollTop(containerRef.current.scrollTop);
        }
      }, 100);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [containerRef]);

  // 可視範囲のインデックス計算
  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight, totalHeight, virtualIndices } = useMemo(() => {
    if (count === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        totalHeight: 0,
        virtualIndices: [],
      };
    }

    // データ件数が閾値以下（通常利用規模）の場合は、仮想スクロールによる間引きを行わず全件を描画。
    // これにより、スクロール時の描画遅延や白飛び、レコード消失が一切発生しません。
    if (count <= disableThreshold) {
      const allIndices: number[] = new Array(count);
      for (let i = 0; i < count; i++) {
        allIndices[i] = i;
      }
      return {
        startIndex: 0,
        endIndex: count,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        totalHeight: count * estimateItemHeight,
        virtualIndices: allIndices,
      };
    }

    const currentViewport = viewportHeight > 0 ? viewportHeight : defaultContainerHeight;
    const rawStart = Math.floor(scrollTop / estimateItemHeight);
    const rawEnd = Math.ceil((scrollTop + currentViewport) / estimateItemHeight);

    // overscanバッファを広めに取り、急なスクロールでも常に画面外に余裕を持たせる
    const start = Math.max(0, rawStart - overscan);
    const end = Math.min(count, Math.max(rawEnd + overscan, start + 1));

    const topSpacer = start * estimateItemHeight;
    const bottomSpacer = Math.max(0, (count - end) * estimateItemHeight);
    const total = count * estimateItemHeight;

    const indices: number[] = [];
    for (let i = start; i < end; i++) {
      indices.push(i);
    }

    return {
      startIndex: start,
      endIndex: end,
      topSpacerHeight: topSpacer,
      bottomSpacerHeight: bottomSpacer,
      totalHeight: total,
      virtualIndices: indices,
    };
  }, [count, estimateItemHeight, overscan, scrollTop, viewportHeight, defaultContainerHeight, disableThreshold]);

  // 指定位置へのスクロールユーティリティ
  const scrollToIndex = useCallback(
    (
      index: number,
      options?: {
        align?: 'start' | 'center' | 'end' | 'auto';
        behavior?: ScrollBehavior;
      }
    ) => {
      const container = containerRef.current;
      if (!container || count === 0) return;

      const targetIndex = Math.max(0, Math.min(count - 1, index));
      const targetTop = targetIndex * estimateItemHeight;
      const targetBottom = targetTop + estimateItemHeight;
      const currentScrollTop = container.scrollTop;
      const currentViewport = container.clientHeight || defaultContainerHeight;
      const align = options?.align || 'auto';
      const behavior = options?.behavior || 'auto';

      let nextScrollTop = currentScrollTop;

      if (align === 'start') {
        nextScrollTop = targetTop;
      } else if (align === 'end') {
        nextScrollTop = targetBottom - currentViewport;
      } else if (align === 'center') {
        nextScrollTop = targetTop - currentViewport / 2 + estimateItemHeight / 2;
      } else {
        // 'auto'
        if (targetTop < currentScrollTop) {
          nextScrollTop = targetTop;
        } else if (targetBottom > currentScrollTop + currentViewport) {
          nextScrollTop = targetBottom - currentViewport;
        }
      }

      container.scrollTo({
        top: Math.max(0, nextScrollTop),
        behavior,
      });
    },
    [containerRef, count, estimateItemHeight, defaultContainerHeight]
  );

  return {
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    totalHeight,
    virtualIndices,
    scrollToIndex,
    isScrolling,
  };
}
