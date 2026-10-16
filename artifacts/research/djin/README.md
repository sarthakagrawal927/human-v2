# Longitudinal model qualification

DJIN is a peer-reviewed coupled stochastic health-trajectory and survival model, trained on ELSA. It is a closer temporal match than Pulse. The released MIT source at commit 24fc278a9bd188c7e60c657a0d65dd79b051a446 and its checkpoint were inspected locally. The checkpoint loads in weights-only mode: 220 tensors, 62,381 scalar parameters. No predictions were generated. See qualification.json for the hash and input inventory.

## Why it cannot yet implement the requested experiment

- The 29 dynamic variables include functional strength, impairment scores, blood pressure/pulse and laboratory biomarkers. There is no lung volume, gas-exchange capacity, cooling capacity or structural heart-pumping input. Lung/asthma medication is a background indicator, not a respiratory-capacity state.
- Age normalization is loaded from Data/train_files/T_stats.npy by DataLoader/dataset.py, lines 155 and 185. This is not in the released tree or checkpoint. Training reconstructs it from the original train.csv (lines 219–225), which is not provided. The original ELSA data requires registration. The five public forks checked have no corresponding normalization path, GitHub has no releases, and the Zenodo record holds synthetic populations and column descriptors. Guessing normalization, or retraining with the small sample dataset, would not reproduce the published model.
- The paper validates conditional observational health and survival trajectories. It explicitly excludes intervention-induced changes in network interactions and higher-than-pairwise effects (Discussion). It cannot establish the causal long-term effect of a novel anatomical change by changing a biomarker and keeping every other mechanism fixed.
- Hearing is an impairment score, not sensory gain or acoustic overload. Grip force is not muscle efficiency. Blood pressure is not pumping capacity. Reusing the product's old slider labels would misrepresent the model.
- The mortality component predicts all-cause hazard using a GRU and history. A sampled model death is not a known individual fatal year or an identified failing organ. Matching a survival calibration statistic does not validate that diagnosis.

Source: https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1009746 and https://github.com/Spencerfar/djin-aging.

## Available directions, awaiting owner scope clarification

The verified evidence separates two product paths: body redesign with supported short-term physiology and unknown yearly effects; or yearly health experiments around studied clinical/lifestyle inputs. Neither is silently substituted for the full owner objective. The current home remains unchanged while this substantive scope decision is pending.

A second candidate for the studied-input path is Michigan MICROSIM (peer-reviewed development/validation, 2024): annual risk-factor changes, cardiovascular/cognitive events and mortality, including BP-treatment effects from trial meta-analyses. Source: https://github.com/jburke5/microsim; publication: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0300005. The current checkout 9d70cd7754779047d6cd241d9f217314cd9e0f61 includes later additions and has not been independently qualified. A pre-publication candidate commit is 9205c3869c478127df31cf77b005155a2de71072 (2024-05-09); date proximity is not proof that it is the publication's exact version. No MICROSIM results are claimed.
