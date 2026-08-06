import { GuidedTourController } from './GuidedTourController.js';
import { TOUR_STEPS, tourHelpers } from './GuidedTourSteps.js';

let tourInstance = null;

export function GuidedTour() {
  const controller = new GuidedTourController(TOUR_STEPS, tourHelpers);
  tourInstance = controller.getApi();
  return controller.refs.menuButton;
}

export const getGuidedTour = () => tourInstance;
