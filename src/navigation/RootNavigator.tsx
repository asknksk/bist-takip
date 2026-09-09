import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AddTransactionScreen from '../screens/AddTransactionScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import SummaryScreen from '../screens/SummaryScreen';
import HistoryScreen from '../screens/HistoryScreen';

const Tab = createBottomTabNavigator();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="İşlem Ekle" component={AddTransactionScreen} />
        <Tab.Screen name="Portföy" component={PortfolioScreen} />
        <Tab.Screen name="Özet" component={SummaryScreen} />
        <Tab.Screen name="Geçmiş" component={HistoryScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
