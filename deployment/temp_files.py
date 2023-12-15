from typing import Generator
from contextlib import contextmanager
import os
import secrets
import shutil


def get_temp_file() -> str:
    """Gets a path to a random file which is in a folder that exists. This does not
    manage cleaning the file on your behalf
    """
    os.makedirs("tmp", exist_ok=True)
    return os.path.join("tmp", secrets.token_hex(16))


@contextmanager
def temp_file(ext: str = "") -> Generator[str, None, None]:
    """Creates a temporary file and deletes it when done; yields the path to the file.

    This is lighter weight than the tempfile module, and is less secure, but it
    is generally easier for debugging, especially cross-platform.

    Stores the files in the `tmp` folder, which is created if it doesn't exist
    """
    os.makedirs("tmp", exist_ok=True)
    tmp_file_loc = os.path.join("tmp", secrets.token_hex(16) + ext)
    try:
        yield tmp_file_loc
    finally:
        try:
            os.remove(tmp_file_loc)
        except FileNotFoundError:
            pass


@contextmanager
def temp_dir() -> Generator[str, None, None]:
    """Creates a directory and deletes it when done; yields the path to the directory.

    This is lighter weight than the tempfile module, and is less secure, but it
    is generally easier for debugging, especially cross-platform.

    Stores the folder in the `tmp` folder, and creates it if it doesn't exist
    """
    tmp_dir_loc = os.path.join("tmp", secrets.token_hex(16))
    os.makedirs(tmp_dir_loc, exist_ok=True)
    try:
        yield tmp_dir_loc
    finally:
        shutil.rmtree(tmp_dir_loc)
