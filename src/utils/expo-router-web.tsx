import React, { createContext, useContext, useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';

interface RouterContextType {
  route: string;
  params: Record<string, string>;
  push: (href: string | { pathname: string; params?: Record<string, any> }) => void;
  replace: (href: string | { pathname: string; params?: Record<string, any> }) => void;
  back: () => void;
}

const RouterContext = createContext<RouterContextType>({
  route: '/(tabs)',
  params: {},
  push: () => {},
  replace: () => {},
  back: () => {},
});

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [route, setRoute] = useState<string>('/(tabs)');
  const [params, setParams] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<string[]>(['/(tabs)']);

  const navigate = (href: string | { pathname: string; params?: Record<string, any> }) => {
    let targetPath = '';
    let targetParams: Record<string, string> = {};

    if (typeof href === 'string') {
      targetPath = href;
    } else {
      targetPath = href.pathname;
      if (href.params) {
        Object.entries(href.params).forEach(([k, v]) => {
          targetParams[k] = String(v);
        });
      }
    }

    // Parse path parameters e.g. /play/starter_fur_elise
    if (targetPath.startsWith('/play/')) {
      const id = targetPath.replace('/play/', '');
      targetParams.id = id;
    }

    setRoute(targetPath);
    setParams(targetParams);
    setHistory((prev) => [...prev, targetPath]);
  };

  const back = () => {
    setHistory((prev) => {
      if (prev.length > 1) {
        const next = [...prev];
        next.pop();
        const prevRoute = next[next.length - 1];
        setRoute(prevRoute);
        return next;
      }
      return prev;
    });
  };

  return (
    <RouterContext.Provider
      value={{
        route,
        params,
        push: navigate,
        replace: navigate,
        back,
      }}
    >
      {children}
    </RouterContext.Provider>
  );
};

export function useRouter() {
  const ctx = useContext(RouterContext);
  return {
    route: ctx.route,
    push: ctx.push,
    replace: ctx.replace,
    back: ctx.back,
  };
}

export function useLocalSearchParams<T extends Record<string, any> = Record<string, string>>(): T {
  const ctx = useContext(RouterContext);
  return ctx.params as T;
}

export const Stack: any = ({ children }: { children: React.ReactNode }) => {
  return <View style={styles.stack}>{children}</View>;
};
Stack.Screen = () => null;

export const Tabs: any = ({ children }: { children: React.ReactNode }) => {
  return <View style={styles.tabsContainer}>{children}</View>;
};
Tabs.Screen = () => null;

const styles = StyleSheet.create({
  stack: {
    flex: 1,
  },
  tabsContainer: {
    flex: 1,
  },
});
