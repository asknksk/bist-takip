import { DarkTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import AddTransactionScreen from '../screens/AddTransactionScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import SummaryScreen from '../screens/SummaryScreen';
import HistoryScreen from '../screens/HistoryScreen';
import { colors, typography } from '../theme/theme';

const Tab = createBottomTabNavigator();

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
  },
};

type IoniconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  'İşlem Ekle': { active: 'add-circle', inactive: 'add-circle-outline' },
  Portföy: { active: 'pie-chart', inactive: 'pie-chart-outline' },
  Özet: { active: 'bar-chart', inactive: 'bar-chart-outline' },
  Geçmiş: { active: 'time', inactive: 'time-outline' },
};

export default function RootNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { fontFamily: typography.fontSemiBold, color: colors.textPrimary },
          headerShadowVisible: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: 64,
            paddingBottom: 10,
            paddingTop: 8,
          },
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: { fontFamily: typography.fontMedium, fontSize: 12 },
          tabBarIcon: ({ focused, color, size }) => {
            const icons = TAB_ICONS[route.name];
            return (
              <Ionicons
                name={focused ? icons.active : icons.inactive}
                size={size}
                color={color}
              />
            );
          },
        })}
      >
        <Tab.Screen name="İşlem Ekle" component={AddTransactionScreen} />
        <Tab.Screen name="Portföy" component={PortfolioScreen} />
        <Tab.Screen name="Özet" component={SummaryScreen} />
        <Tab.Screen name="Geçmiş" component={HistoryScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
