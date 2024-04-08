import { ReactElement } from 'react';
import styles from './Socials.module.css';

export const Socials = (): ReactElement => {
  return (
    <div className={styles.container}>
      <a href="https://www.instagram.com/meetoseh/" className={styles.item}>
        <svg
          width="16"
          height="18"
          viewBox="0 0 10 11"
          fill="none"
          xmlns="http://www.w3.org/2000/svg">
          <path
            d="M2.9 0.607422H7.1C8.7 0.607422 10 1.90742 10 3.50742V7.70742C10 8.47655 9.69447 9.21418 9.15061 9.75803C8.60675 10.3019 7.86913 10.6074 7.1 10.6074H2.9C1.3 10.6074 0 9.30742 0 7.70742V3.50742C0 2.73829 0.305535 2.00067 0.84939 1.45681C1.39325 0.912957 2.13087 0.607422 2.9 0.607422ZM2.8 1.60742C2.32261 1.60742 1.86477 1.79706 1.52721 2.13463C1.18964 2.4722 1 2.93003 1 3.40742V7.80742C1 8.80242 1.805 9.60742 2.8 9.60742H7.2C7.67739 9.60742 8.13523 9.41778 8.47279 9.08021C8.81036 8.74265 9 8.28481 9 7.80742V3.40742C9 2.41242 8.195 1.60742 7.2 1.60742H2.8ZM7.625 2.35742C7.79076 2.35742 7.94973 2.42327 8.06694 2.54048C8.18415 2.65769 8.25 2.81666 8.25 2.98242C8.25 3.14818 8.18415 3.30715 8.06694 3.42436C7.94973 3.54157 7.79076 3.60742 7.625 3.60742C7.45924 3.60742 7.30027 3.54157 7.18306 3.42436C7.06585 3.30715 7 3.14818 7 2.98242C7 2.81666 7.06585 2.65769 7.18306 2.54048C7.30027 2.42327 7.45924 2.35742 7.625 2.35742ZM5 3.10742C5.66304 3.10742 6.29893 3.37081 6.76777 3.83965C7.23661 4.3085 7.5 4.94438 7.5 5.60742C7.5 6.27046 7.23661 6.90635 6.76777 7.37519C6.29893 7.84403 5.66304 8.10742 5 8.10742C4.33696 8.10742 3.70107 7.84403 3.23223 7.37519C2.76339 6.90635 2.5 6.27046 2.5 5.60742C2.5 4.94438 2.76339 4.3085 3.23223 3.83965C3.70107 3.37081 4.33696 3.10742 5 3.10742ZM5 4.10742C4.60218 4.10742 4.22064 4.26546 3.93934 4.54676C3.65804 4.82807 3.5 5.2096 3.5 5.60742C3.5 6.00525 3.65804 6.38678 3.93934 6.66808C4.22064 6.94939 4.60218 7.10742 5 7.10742C5.39782 7.10742 5.77936 6.94939 6.06066 6.66808C6.34196 6.38678 6.5 6.00525 6.5 5.60742C6.5 5.2096 6.34196 4.82807 6.06066 4.54676C5.77936 4.26546 5.39782 4.10742 5 4.10742Z"
            fill="#EAEAEB"
          />
        </svg>
      </a>
      <a href="https://www.tiktok.com/@meetoseh" className={styles.item}>
        <svg
          width="16"
          height="18"
          viewBox="0 0 10 11"
          fill="none"
          xmlns="http://www.w3.org/2000/svg">
          <path
            d="M7.56696 2.17409C7.1855 1.74055 6.97529 1.18377 6.97545 0.607422H5.25112V7.49631C5.23782 7.8691 5.07973 8.22221 4.81014 8.48128C4.54055 8.74034 4.1805 8.88515 3.8058 8.8852C3.01339 8.8852 2.35491 8.24076 2.35491 7.44076C2.35491 6.4852 3.28125 5.76853 4.23549 6.06298V4.30742C2.31027 4.05187 0.625 5.54076 0.625 7.44076C0.625 9.29076 2.16518 10.6074 3.80022 10.6074C5.55246 10.6074 6.97545 9.19076 6.97545 7.44076V3.94631C7.67466 4.44623 8.51415 4.71445 9.375 4.71298V2.99631C9.375 2.99631 8.32589 3.04631 7.56696 2.17409Z"
            fill="#EAEAEB"
          />
        </svg>
      </a>
      <a href="https://twitter.com/meetoseh" className={styles.item}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg">
          <path
            d="M9.42655 6.85125L15.0108 0.5H13.6874L8.83894 6.015L4.96583 0.5H0.5L6.35629 8.83938L0.5 15.5H1.8234L6.94326 9.67625L11.0335 15.5H15.5L9.42655 6.85125ZM7.61454 8.91313L7.02054 8.0825L2.30115 1.475H4.33351L8.14275 6.8075L8.73675 7.63812L13.6886 14.5694H11.6563L7.61454 8.91313Z"
            fill="#EAEAEB"
          />
        </svg>
      </a>
    </div>
  );
};
