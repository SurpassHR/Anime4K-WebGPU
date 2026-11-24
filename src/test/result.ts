export const appendResult = (text: string): void => {
  document.body.dataset.result = (document.body.dataset.result ?? "") + " | " + text;
};
