/* eslint-disable */
import { Tabs, Button, Box } from '@chakra-ui/react'
import { useState } from 'react'
import { FiCamera, FiMonitor, FiGlobe } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { sidebarStyles } from './sidebar-styles'
import CameraPanel from './camera-panel'
import ScreenPanel from './screen-panel'
import BrowserPanel from './browser-panel'

function BottomTab(): JSX.Element {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  
  return (
    <Box>
      <Button width="100%" variant="ghost" aria-expanded={expanded} aria-controls="visual-input-panel" onClick={() => setExpanded(!expanded)}>
        {expanded ? '收起视觉输入' : '展开视觉输入（可选）'}
      </Button>
      <Box id="visual-input-panel" hidden={!expanded}>
    <Tabs.Root 
      defaultValue="camera" 
      variant="plain"
      {...sidebarStyles.bottomTab.container}
    >
      <Tabs.List {...sidebarStyles.bottomTab.list}>
        <Tabs.Trigger value="camera" {...sidebarStyles.bottomTab.trigger}>
          <FiCamera />
          {t('sidebar.camera')}
        </Tabs.Trigger>
        <Tabs.Trigger value="screen" {...sidebarStyles.bottomTab.trigger}>
          <FiMonitor />
          {t('sidebar.screen')}
        </Tabs.Trigger>
        <Tabs.Trigger value="browser" {...sidebarStyles.bottomTab.trigger}>
          <FiGlobe />
          {t('sidebar.browser')}
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="camera">
        <CameraPanel />
      </Tabs.Content>
      
      <Tabs.Content value="screen">
        <ScreenPanel />
      </Tabs.Content>
      
      <Tabs.Content value="browser">
        <BrowserPanel />
      </Tabs.Content>
    </Tabs.Root>
      </Box>
    </Box>
  );
}

export default BottomTab
